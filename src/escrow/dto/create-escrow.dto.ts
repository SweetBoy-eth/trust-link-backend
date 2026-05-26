import { 
  IsNumber, 
  IsPositive, 
  IsString, 
  MinLength, 
  MaxLength,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { IsStellarAddress } from '../../common/validators/stellar-address.validator';

export class CreateEscrowDto {
  @IsString()
  @MinLength(3, { message: 'Item name must be at least 3 characters long' })
  @MaxLength(100, { message: 'Item name must not exceed 100 characters' })
  @Transform(({ value }) => value?.trim())
  itemName!: string;

  @IsNumber({}, { message: 'Amount must be a valid number' })
  @IsPositive({ message: 'Amount must be positive' })
  @Min(0.0000001, { message: 'Amount must be at least 0.0000001' })
  @Max(1000000, { message: 'Amount must not exceed 1,000,000' })
  amount!: number;

  @IsString()
  @MinLength(3, { message: 'Currency must be at least 3 characters long' })
  @MaxLength(12, { message: 'Currency must not exceed 12 characters' })
  @Matches(/^[A-Z0-9]+$/, { message: 'Currency must contain only uppercase letters and numbers' })
  @Transform(({ value }) => value?.toUpperCase().trim())
  currency!: string;

  @IsString()
  @IsStellarAddress()
  @Transform(({ value }) => value?.trim())
  buyerAddress!: string;
}
