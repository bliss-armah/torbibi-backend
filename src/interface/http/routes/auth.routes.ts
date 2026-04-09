import { Router } from 'express';
import { AuthController } from '../controllers/AuthController';
import { validate } from '../middleware/validate.middleware';
import { authenticate } from '../middleware/auth.middleware';
import { asyncHandler } from '../middleware/error.middleware';
import { RequestOtpSchema, VerifyOtpSchema } from '../../../application/auth/dtos/auth.dto';

const router = Router();

router.post('/otp/request', validate(RequestOtpSchema), asyncHandler(AuthController.requestOtp));
router.post('/otp/verify', validate(VerifyOtpSchema), asyncHandler(AuthController.verifyOtp));
router.get('/me', authenticate, asyncHandler(AuthController.me));

export default router;
