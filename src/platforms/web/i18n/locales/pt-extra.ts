import type { TranslationTree } from '../types';
import { esExtra } from './es-extra';

export const ptExtra: TranslationTree = {
  ...esExtra,
  propertiesUi: {
    ...(esExtra.propertiesUi as TranslationTree),
    leaseAndTenancy: 'Contrato e ocupacao',
    purchaseAndValuation: 'Compra e avaliacao',
    viewAll: 'Ver tudo',
    noDocumentsUploaded: 'Ainda nao existem documentos carregados.',
