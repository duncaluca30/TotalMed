const validate = (schema) => (req, res, next) => {
  try {
    schema.parse(req.body);
    next();
  } catch (error) {

    const issues = error.issues || [];
    return res.status(400).json({
      error: "Validation failed",
      details: issues.map(err => ({ field: err.path.join('.'), message: err.message }))
    });
  }
};

module.exports = validate;
