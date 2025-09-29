const { query, withTransaction } = require('../db/pg');
const PDFDocument = require('pdfkit');
const { body, validationResult } = require('express-validator');

const validateCheckout = [
  body('buyer.name').trim().isLength({ min: 2 }).withMessage('Nombre requerido'),
  body('buyer.email').optional().isEmail().withMessage('Email inválido'),
  body('buyer.phone').optional().isLength({ min: 6 }).withMessage('Teléfono inválido'),
  body('items').isArray({ min: 1 }).withMessage('Debe enviar items'),
  body('items.*.productId').isInt({ gt: 0 }).withMessage('productId inválido'),
  body('items.*.quantity').isInt({ gt: 0 }).withMessage('quantity inválido'),
];

async function createOrder(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { buyer, items } = req.body;

  try {
    const result = await withTransaction(async (client) => {
      // Cargar productos involucrados y bloquear filas para stock
      const ids = items.map((i) => i.productId);
      const { rows: products } = await client.query(
        `SELECT id, name, price::float AS price, stock_quantity
           FROM Products
          WHERE id = ANY($1::int[]) FOR UPDATE`,
        [ids]
      );

      // Mapear por id
      const byId = new Map(products.map((p) => [p.id, p]));

      // Validar stock y calcular total
      let total = 0;
      for (const item of items) {
        const p = byId.get(item.productId);
        if (!p) throw new Error(`Producto ${item.productId} inexistente`);
        if (p.stock_quantity < item.quantity) {
          const e = new Error(`Stock insuficiente para producto ${p.name}`);
          e.statusCode = 409;
          throw e;
        }
        total += p.price * item.quantity;
      }

      // Descontar stock
      for (const item of items) {
        await client.query(
          'UPDATE Products SET stock_quantity = stock_quantity - $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
          [item.quantity, item.productId]
        );
      }

      // Crear orden (sin order_number aún)
      const insOrder = await client.query(
        `INSERT INTO Orders(user_id, order_date, status, total_amount, buyer_name, buyer_email, buyer_phone)
         VALUES (NULL, CURRENT_TIMESTAMP, $1, $2, $3, $4, $5) RETURNING id`,
        ['PAID', total, buyer.name, buyer.email || null, buyer.phone || null]
      );
      const orderId = insOrder.rows[0].id;

      // Insertar items con precio actual
      for (const item of items) {
        const p = byId.get(item.productId);
        await client.query(
          `INSERT INTO OrderItems(order_id, product_id, quantity, unit_price)
           VALUES ($1, $2, $3, $4)`,
          [orderId, item.productId, item.quantity, p.price]
        );
      }

      // Asignar order_number legible
      const ymd = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const orderNumber = `ORD-${ymd}-${orderId}`;
      await client.query('UPDATE Orders SET order_number = $1 WHERE id = $2', [orderNumber, orderId]);

      return { orderId, orderNumber };
    });

    res.status(201).json(result);
  } catch (err) {
    console.error('Error en checkout:', err.message);
    if (err.statusCode) return res.status(err.statusCode).json({ error: err.message });
    res.status(500).json({ error: 'No se pudo crear la orden' });
  }
}

async function listOrders(req, res) {
  try {
    const { rows } = await query(
      `SELECT id, order_number, buyer_name, buyer_email, buyer_phone,
              total_amount::float AS total_amount, status, order_date
         FROM Orders
        WHERE deleted_at IS NULL OR deleted_at IS NULL
        ORDER BY id DESC
        LIMIT 200`
    );
    res.json(rows);
  } catch (err) {
    console.error('Error al listar pedidos:', err.message);
    res.status(500).json({ error: 'No se pudo obtener pedidos' });
  }
}

async function orderPdf(req, res) {
  const { id } = req.params;
  try {
    const { rows: orders } = await query(
      `SELECT id, order_number, buyer_name, buyer_email, buyer_phone, total_amount::float AS total_amount, status, order_date
         FROM Orders WHERE id = $1`,
      [id]
    );
    if (!orders.length) return res.status(404).json({ error: 'Orden no encontrada' });
    const order = orders[0];

    const { rows: items } = await query(
      `SELECT oi.quantity, oi.unit_price::float AS unit_price, p.name
         FROM OrderItems oi
         JOIN Products p ON p.id = oi.product_id
        WHERE oi.order_id = $1`,
      [id]
    );

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${order.order_number}.pdf"`);
    const doc = new PDFDocument({ margin: 50 });
    doc.pipe(res);

    doc.fontSize(18).text('Comprobante de Compra', { align: 'center' }).moveDown(1);
    doc.fontSize(12).text(`N° de Orden: ${order.order_number}`);
    doc.text(`Fecha: ${new Date(order.order_date).toLocaleString()}`);
    doc.text(`Comprador: ${order.buyer_name}`);
    if (order.buyer_email) doc.text(`Email: ${order.buyer_email}`);
    if (order.buyer_phone) doc.text(`Teléfono: ${order.buyer_phone}`);

    doc.moveDown(1).fontSize(14).text('Items:');
    doc.moveDown(0.5).fontSize(12);
    items.forEach((it, idx) => {
      doc.text(`${idx + 1}. ${it.name}  x${it.quantity}  - $${it.unit_price.toFixed(2)}`);
    });

    doc.moveDown(1).fontSize(14).text(`Total: $${order.total_amount.toFixed(2)}`, { align: 'right' });
    doc.end();
  } catch (err) {
    console.error('Error al generar PDF:', err.message);
    res.status(500).json({ error: 'No se pudo generar el PDF' });
  }
}

module.exports = { validateCheckout, createOrder, listOrders, orderPdf };

