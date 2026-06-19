const { z } = require('zod');

const registerSchema = z.object({
  email: z.string().email("Invalid email format"),
  password: z.string()
    .min(8, "Password must be at least 8 characters long")
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{8,}$/, 
      "Password must include an uppercase letter, a lowercase letter, a number, and a special character"
    ),
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  dateOfBirth: z.string().refine((dateStr) => {
    const dob = new Date(dateStr);
    return !isNaN(dob.getTime()) && dob <= new Date();
  }, { message: "Invalid date of birth or date is in the future" }),
  phone: z.string().min(5, "Phone number is required")
});

const loginSchema = z.object({
  email: z.string().email("Invalid email format"),
  password: z.string().min(1, "Password is required")
});

const forgotPasswordSchema = z.object({
  email: z.string().email("Invalid email format")
});

const strongPassword = z.string()
  .min(8, "Password must be at least 8 characters long")
  .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{8,}$/,
    "Password must include an uppercase letter, a lowercase letter, a number, and a special character"
  );

const resetPasswordSchema = z.object({
  token: z.string().min(1, "Reset token is required"),
  password: strongPassword
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: strongPassword
});

module.exports = { registerSchema, loginSchema, forgotPasswordSchema, resetPasswordSchema, changePasswordSchema };
