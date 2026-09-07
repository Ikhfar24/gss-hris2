import { Global, Module } from '@nestjs/common';
import { CoordinatorScopeController } from './coordinator-scope.controller';
import { CoordinatorScopeService } from './coordinator-scope.service';

@Global()
@Module({ controllers: [CoordinatorScopeController], providers: [CoordinatorScopeService], exports: [CoordinatorScopeService] })
export class CoordinatorScopeModule {}
