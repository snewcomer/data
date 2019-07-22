import InternalModel from './model/internal-model';
import { RecordIdentifier } from '../ts-interfaces/identifier';

export function identifierForIM(im: InternalModel): RecordIdentifier {
  return im.identifier;
}

export function identifierForModel(model): RecordIdentifier {
  return model._internalModel.identifier;
}
