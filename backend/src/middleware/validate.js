const validate = (schema) => (req, res, next) => {
  try {
    schema.parse(req.body);
    next();
  } catch (error) {
    return res.status(400).json({ 
      error: "Validation failed", 
      details: error.errors.map(err => ({ field: err.path.join('.'), message: err.message }))
    });
  }
};

module.exports = validate;
