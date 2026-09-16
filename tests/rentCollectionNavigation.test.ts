import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { translate } from '../src/platforms/web/i18n/translations';

test('Rent Collection uses the existing workspace navigation and page renderer conventions', () => {
  const sidebar = readFileSync('src/platforms/web/components/Sidebar.tsx', 'utf8');
  const renderer = readFileSync('src/platforms/web/components/AppPageRenderer.tsx', 'utf8');
  const workspace = readFileSync('src/common/utils/workspace.ts', 'utf8');
  assert.match(sidebar, /'rent-collection'.*nav\.rentCollection/);
  assert.match(renderer, /case 'rent-collection'/);
  assert.match(renderer, /<RentCollectionPage/);
  assert.match(workspace, /'rent-collection': 'Rent Collection'/);
});

test('property Lease & Tenancy renders the shared compact Rent History component', () => {
  const propertyCard = readFileSync('src/platforms/web/components/PropertyCardExpanded.tsx', 'utf8');
  assert.match(propertyCard, /<RentHistory property=\{property\}/);
});

test('due-day CTAs target Properties and the Lease & Tenancy editor for the first affected property', () => {
  const rentCollection = readFileSync('src/platforms/web/pages/RentCollectionPage.tsx', 'utf8');
  const app = readFileSync('src/platforms/web/App.tsx', 'utf8');
  const properties = readFileSync('src/platforms/web/pages/PropertiesPage.tsx', 'utf8');
  const renderer = readFileSync('src/platforms/web/components/AppPageRenderer.tsx', 'utf8');

  assert.match(rentCollection, /const openDueDaySetup = \(\) => onOpenProperties/);
  assert.match(rentCollection, /onClick=\{openDueDaySetup\}/);
  assert.match(app, /setPropertiesNavigationTarget\(propertyId && setup \? \{ propertyId, section: 'lease-tenancy'/);
  assert.match(app, /setCurrentPage\('properties'\)/);
  assert.match(renderer, /propertyNavigationTarget=\{props\.propertiesNavigationTarget\}/);
  assert.match(properties, /setSectionEditingSection\('lease-tenancy'\)/);
  assert.match(properties, /dueDaySetupContext=/);
  const sectionEditor = readFileSync('src/platforms/web/components/PropertySectionEditModal.tsx', 'utf8');
  assert.match(sectionEditor, /rentDueDayHelper/);
  assert.match(sectionEditor, /scrollIntoView/);
  assert.match(sectionEditor, /saveAndConfigureNext/);
  assert.doesNotMatch(app, /onOpenProperties=\{\(\) => setCurrentPage\('taxes'\)\}/);
});

test('contextual due-day copy resolves in English, Spanish, and Portuguese', () => {
  const expected = {
    en: ['2 of 5 properties missing rent due day', 'Required to generate monthly rent receivables.', 'Save & configure next'],
    es: ['2 de 5 propiedades sin día de vencimiento', 'Necesario para generar los recibos mensuales de alquiler.', 'Guardar y configurar la siguiente'],
    pt: ['2 de 5 imóveis sem dia de vencimento', 'Necessário para gerar recibos mensais de renda.', 'Guardar e configurar seguinte'],
  } as const;

  (Object.keys(expected) as Array<keyof typeof expected>).forEach((language) => {
    const [progress, helper, next] = expected[language];
    assert.equal(translate(language, 'properties.form.rentDueDayProgress', { position: 2, total: 5 }), progress);
    assert.equal(translate(language, 'properties.form.rentDueDayHelper'), helper);
    assert.equal(translate(language, 'properties.form.saveAndConfigureNext'), next);
    assert.ok(!progress.includes('properties.form.'));
    assert.ok(!helper.includes('properties.form.'));
    assert.ok(!next.includes('properties.form.'));
  });
});
