import { IsNumber, IsPositive, IsString, MinLength } from 'class-validator';

export class CreateEscrowDto {
  @IsString()
  @MinLength(3)
  itemName!: string;

  @IsString()
  @MinLength(3)
  itemRef!: string;

  @IsNumber()
  @IsPositive()
  amount!: number;

  @IsString()
  @MinLength(3)
  currency!: string;

  @IsString()
  @MinLength(3)
  buyerAddress!: string;
}
