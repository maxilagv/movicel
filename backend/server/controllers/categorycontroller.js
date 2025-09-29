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
    .isLength({ min: 3, max: 100 }).withMessage('El nombre debe tener entre 3 y 100 caracteres')
    .escape(),
  check('image_url')
    .trim()
    .notEmpty().withMessage('La imagen es obligatoria')
    .isURL().withMessage('La imagen debe ser una URL válida')
    .escape(),
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
    .isLength({ min: 3, max: 100 }).withMessage('El nombre debe tener entre 3 y 100 caracteres')
    .escape(),
  check('image_url')
    .optional()
    .trim()
    .custom((value) => {
      if (value === undefined || value === null) return true;
      const v = String(value).trim();
      if (v === '') return true; // permitir limpiar si se desea
      const isHttpUrl = /^https?:\/\//i.test(v);
      const looksLikePath = /[\/\\]/.test(v) || /^[A-Za-z]:\\/.test(v);
      return isHttpUrl || looksLikePath;
    }).withMessage('La imagen debe ser una URL http(s) o una ruta válida')
    .escape(),
  check('description')
    .optional()
    .isLength({ max: 2000 }).withMessage('La descripción es demasiado larga')
];

// Crear categoría
async function createCategoria(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { name, image_url, description } = req.body;

  try {
    const { rows } = await query(
      'INSERT INTO Categories(name, image_url, description) VALUES ($1, $2, $3) RETURNING id',
      [name, image_url, description || null]
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
    return res.status(400).json({ errors: errors.array() });
  }

  const { id } = req.params;
  const { name, image_url, description } = req.body || {};

  if (!id) {
    return res.status(400).json({ error: 'ID de la categoría requerido para actualizar' });
  }

  try {
    // Mapear valores no enviados a null para usar COALESCE en el UPDATE
    const nameVal = typeof name === 'undefined' ? null : name;
    const imgVal = typeof image_url === 'undefined' ? null : image_url;
    const descVal = typeof description === 'undefined' ? null : (description || null);

    await query(
      `UPDATE Categories
          SET name = COALESCE($1, name),
              -- Si llega una URL http(s), guardamos en image_url; si es ruta, guardamos en image_file_path
              image_url = CASE
                            WHEN $2 IS NULL THEN image_url
                            WHEN $2 ~* '^(https?://)' THEN $2
                            ELSE NULL
                          END,
              image_file_path = CASE
                                  WHEN $2 IS NULL THEN image_file_path
                                  WHEN $2 ~* '^(https?://)' THEN image_file_path
                                  ELSE $2
                                END,
              description = COALESCE($3, description),
              updated_at = CURRENT_TIMESTAMP
        WHERE id = $4`,
      [nameVal, imgVal, descVal, id]
    );
    res.json({ message: 'Categoría actualizada correctamente' });
  } catch (err) {
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
