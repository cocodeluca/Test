import type { TranslationTree } from '../types';
import { es } from './es';

export const pt: TranslationTree = {
  ...es,
  properties: {
    ...es.properties,
    tabs: {
      ...es.properties.tabs,
      mortgage: 'Impacto da Hipoteca',
    },
    mortgageImpact: {
      title: 'Impacto da Hipoteca',
      subtitle: 'Veja como esta hipoteca afeta o imovel, o peso do financiamento e a equity criada ao longo do tempo.',
      overviewTitle: 'Visao Geral da Hipoteca',
      impactTitle: 'Impacto da Hipoteca',
      impactBadge: 'Vista financeira do imovel',
      monthlyColumn: 'Impacto mensal',
      annualColumn: 'Impacto anual',
      interestRate: 'Taxa de juro',
      remainingTerm: 'Prazo restante',
      monthlyPrincipal: 'Principal mensal',
      annualPrincipalPaydown: 'Amortizacao anual de principal',
      equityTitle: 'Equity Criada Este Ano',
      equitySubtitle: 'A amortizacao do principal transforma gradualmente o servico da divida em participacao no imovel.',
      mortgageType: 'Tipo de hipoteca',
      rateStructure: 'Estrutura da taxa',
      fixedRate: 'Taxa fixa',
      variableRate: 'Taxa variavel',
      rentBurden: 'A hipoteca consome atualmente {{percentage}} da renda mensal do imovel.',
      rentBurdenUnavailable: 'O peso da hipoteca sobre a renda aparecera quando existir renda mensal disponivel.',
      profileFixed: 'Amortizacao mensal estavel numa hipoteca de taxa fixa com {{term}} restantes.',
      profileVariable: 'O financiamento de taxa variavel continua a gerar equity enquanto o prazo restante decorre ao longo de {{term}}.',
      profileFallback: 'Os detalhes do perfil hipotecario aparecerao aqui quando houver dados de financiamento disponiveis.',
      equityHighlightLabel: 'Equity criada este ano',
      equityHighlightBody: 'Atraves da amortizacao de principal, esta hipoteca contribui com {{amount}} para a criacao anual de equity deste imovel.',
      addMortgage: 'Adicionar hipoteca',
    },
  },
};
