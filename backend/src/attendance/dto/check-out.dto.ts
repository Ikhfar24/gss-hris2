import { CheckInDto } from './check-in.dto';

// Same evidence is captured on check-out (§11.2 lists these fields without
// distinguishing in vs out), so the shape is identical.
export class CheckOutDto extends CheckInDto {}
