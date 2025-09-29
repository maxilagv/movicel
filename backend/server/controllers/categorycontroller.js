const { check, validationResult } = require('express-validator');
const { query } = require('../db/pg');

// Obtener categorías (estandarizado en inglés)
async function getCategorias(req, res) {
  try {
    const { rows } = await query(
      `SELECT id,
              name,
              COALESCE(image_url, image_file_path) AS image_url,
              description
         FROM Categories
        ORDER BY name ASC`
    );
    res.json(rows);
  } catch (err) {
    console.error('Error al obtener categorías:', err);
    res.status(500).json({ error: 'No se pudo obtener categorías' });
  }
}

// Reglas de validación (inglés)
const validateCategory = [
  check('name')
    .trim()
    .notEmpty().withMessage('El nombre es obligatorio')
    .isLength({ min: 2, max: 100 }).withMessage('El nombre debe tener entre 2 y 100 caracteres'),
  check('image_url')
    .trim()
    .notEmpty().withMessage('La imagen es obligatoria'),
  check('description')
    .optional()
    .isLength({ max: 2000 }).withMessage('La descripción es demasiado larga')
];

// Validación específica para actualización: todos los campos opcionales
// y se permite URL http(s) o una ruta de archivo
const validateCategoryUpdate = [
  check('name')
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 }).withMessage('El nombre debe tener entre 2 y 100 caracteres'),
  check('image_url')
    .optional()
    .trim(),
  check('description')
    .optional()
    .isLength({ max: 2000 }).withMessage('La descripción es demasiado larga')
];

// Crear categoría
async function createCategoria(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    console.error('Validación fallida en createCategoria:', errors.array());
    return res.status(400).json({ errors: errors.array() });
  }

  const { name, image_url, description } = req.body;

  try {
    // Decidir destino de imagen según sea URL http(s) o ruta
    const v = String(image_url || '').trim();
    const isHttpUrl = /^https?:\/\//i.test(v);
    const imgUrlVal = isHttpUrl ? v : null;
    const imgFileVal = isHttpUrl ? null : v;

    const { rows } = await query(
      'INSERT INTO Categories(name, image_url, image_file_path, description) VALUES ($1, $2, $3, $4) RETURNING id',
      [name, imgUrlVal, imgFileVal, description || null]
    );
    res.status(201).json({ id: rows[0].id });
  } catch (err) {
    console.error('Error al crear categoría:', err);
    res.status(500).json({ error: 'No se pudo crear la categoría' });
  }
}

// Actualizar categoría
async function updateCategoria(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    console.error('Validación fallida en updateCategoria:', errors.array());
    return res.status(400).json({ errors: errors.array() });
  }

  const { id } = req.params;
  const { name, image_url, description } = req.body || {};

  if (!id) {
    return res.status(400).json({ error: 'ID de la categoría requerido para actualizar' });
  }

  try {
    const idNum = Number(id);
    if (!Number.isInteger(idNum) || idNum <= 0) {
      return res.status(400).json({ error: 'ID invalido' });
    }

    // Obtener valores actuales para decidir imagen
    const current = await query('SELECT image_url, image_file_path FROM Categories WHERE id = $1', [idNum]);
    if (current.rowCount === 0) {
      return res.status(404).json({ error: 'Categoria no encontrada' });
    }
    const cur = current.rows[0];

    // Decidir destino de imagen
    let newImageUrl = cur.image_url || null;
    let newImageFile = cur.image_file_path || null;
    if (typeof image_url !== 'undefined') {
      const v = String(image_url ?? '').trim();
      if (v) {
        if (/^https?:\/\//i.test(v)) {
          newImageUrl = v;
          newImageFile = null;
        } else {
          newImageUrl = null;
          newImageFile = v;
        }
      }
      // si v es vacío: conservar actuales
    }

    // Construir UPDATE dinámico para solo tocar campos provistos + imagen/updated_at
    const sets = [];
    const params = [];
    let p = 1;
    if (typeof name !== 'undefined') { sets.push(`name = $${p++}`); params.push(name); }
    if (typeof description !== 'undefined') { sets.push(`description = $${p++}`); params.push(description || null); }
    sets.push(`image_url = $${p++}`); params.push(newImageUrl);
    sets.push(`image_file_path = $${p++}`); params.push(newImageFile);
    sets.push('updated_at = CURRENT_TIMESTAMP');
    params.push(idNum);

    const sql = `UPDATE Categories SET ${sets.join(', ')} WHERE id = $${p} RETURNING id`;
    const result = await query(sql, params);
    if (!result.rowCount) {
      return res.status(404).json({ error: 'Categoria no encontrada' });
    }
    res.json({ message: 'Categoría actualizada correctamente' });
  } catch (err) {
    if (err && err.code === '23505') {
      return res.status(409).json({ error: 'El nombre de la categoria ya existe' });
    }
    console.error('Error al actualizar categoría:', err);
    res.status(500).json({ error: 'No se pudo actualizar la categoría' });
  }
}

// Eliminar categoría
async function deleteCategoria(req, res) {
  const { id } = req.params;

  if (!id) {
    return res.status(400).json({ error: 'ID de la categoría requerido' });
  }

  try {
    await query('DELETE FROM Categories WHERE id = $1', [id]);
    res.json({ message: 'Categoría eliminada correctamente' });
  } catch (err) {
    console.error('Error al eliminar categoría:', err);
    res.status(500).json({ error: 'No se pudo eliminar la categoría' });
  }
}

module.exports = {
  getCategorias,
  createCategoria: [...validateCategory, createCategoria],
  updateCategoria: [...validateCategoryUpdate, updateCategoria],
  deleteCategoria
};


