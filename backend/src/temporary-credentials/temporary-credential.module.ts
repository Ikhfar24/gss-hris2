import { Global, Module } from '@nestjs/common';
import { TemporaryCredentialService } from './temporary-credential.service';

@Global()
@Module({
  providers: [TemporaryCredentialService],
  exports: [TemporaryCredentialService],
})
export class TemporaryCredentialModule {}
