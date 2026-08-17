import { updateCustomerProfileSchema } from '../validators/customers.validators.js';
import { updateUserProfile } from '../repositories/users.repository.js';

export function me(req, res) {
  res.json({ customer: req.customer });
}

export async function updateMe(req, res, next) {
  try {
    const { fullName, email } = updateCustomerProfileSchema.parse(req.body);
    const user = await updateUserProfile(req.customer.id, { fullName, email });
    res.json({
      customer: {
        id: user.id,
        mobileNumber: user.mobile_number,
        fullName: user.full_name,
        email: user.email,
      },
    });
  } catch (err) {
    next(err);
  }
}
