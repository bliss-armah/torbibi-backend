import { Request, Response } from 'express';
import { RequestOtpUseCase } from '../../../application/auth/use-cases/RequestOtp';
import { VerifyOtpUseCase } from '../../../application/auth/use-cases/VerifyOtp';
import { OtpRepository } from '../../../infrastructure/database/repositories/OtpRepository';
import { UserRepository } from '../../../infrastructure/database/repositories/UserRepository';
import { RequestOtpDto, VerifyOtpDto } from '../../../application/auth/dtos/auth.dto';

// Controllers are thin: validate input (done by middleware), call use case, format response
const otpRepo = new OtpRepository();
const userRepo = new UserRepository();
const requestOtpUseCase = new RequestOtpUseCase(otpRepo, userRepo);
const verifyOtpUseCase = new VerifyOtpUseCase(otpRepo, userRepo);

export class AuthController {
  static async requestOtp(req: Request, res: Response): Promise<void> {
    const dto = req.body as RequestOtpDto;
    const result = await requestOtpUseCase.execute(dto);

    res.status(200).json({
      success: true,
      data: {
        message: 'OTP sent successfully',
        isNewUser: result.isNewUser,
        // Never return the OTP code in production — only useful for testing
        ...(process.env.NODE_ENV === 'development' && {}),
      },
    });
  }

  static async verifyOtp(req: Request, res: Response): Promise<void> {
    const dto = req.body as VerifyOtpDto;
    const tokens = await verifyOtpUseCase.execute(dto);

    res.status(200).json({
      success: true,
      data: tokens,
    });
  }

  static async me(req: Request, res: Response): Promise<void> {
    res.status(200).json({
      success: true,
      data: { user: req.user },
    });
  }
}
