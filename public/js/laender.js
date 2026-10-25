// Kuratierte Länderdaten für Notruf und Währung. Notrufnummern bitte vor Ort
// gegenprüfen – sie ändern sich selten, aber Regionen können abweichen.
// Schlüssel: ISO-3166-Alpha-2.

export const LAENDER = {
  DE: { name: 'Deutschland', waehrung: 'EUR', notruf: { 'Polizei': '110', 'Feuerwehr/Rettung': '112' } },
  AT: { name: 'Österreich', waehrung: 'EUR', notruf: { 'Euro-Notruf': '112', 'Polizei': '133', 'Rettung': '144', 'Feuerwehr': '122' } },
  CH: { name: 'Schweiz', waehrung: 'CHF', notruf: { 'Euro-Notruf': '112', 'Polizei': '117', 'Rettung': '144', 'Feuerwehr': '118' } },
  ES: { name: 'Spanien', waehrung: 'EUR', notruf: { 'Euro-Notruf': '112' } },
  PT: { name: 'Portugal', waehrung: 'EUR', notruf: { 'Euro-Notruf': '112' } },
  FR: { name: 'Frankreich', waehrung: 'EUR', notruf: { 'Euro-Notruf': '112', 'Polizei': '17', 'Rettung': '15', 'Feuerwehr': '18' } },
  IT: { name: 'Italien', waehrung: 'EUR', notruf: { 'Euro-Notruf': '112' } },
  GR: { name: 'Griechenland', waehrung: 'EUR', notruf: { 'Euro-Notruf': '112' } },
  NL: { name: 'Niederlande', waehrung: 'EUR', notruf: { 'Euro-Notruf': '112' } },
  PL: { name: 'Polen', waehrung: 'PLN', notruf: { 'Euro-Notruf': '112' } },
  CZ: { name: 'Tschechien', waehrung: 'CZK', notruf: { 'Euro-Notruf': '112' } },
  HU: { name: 'Ungarn', waehrung: 'HUF', notruf: { 'Euro-Notruf': '112' } },
  RO: { name: 'Rumänien', waehrung: 'RON', notruf: { 'Euro-Notruf': '112' } },
  BG: { name: 'Bulgarien', waehrung: 'EUR', notruf: { 'Euro-Notruf': '112' } },
  SE: { name: 'Schweden', waehrung: 'SEK', notruf: { 'Notruf': '112' } },
  NO: { name: 'Norwegen', waehrung: 'NOK', notruf: { 'Polizei': '112', 'Rettung': '113', 'Feuerwehr': '110' } },
  DK: { name: 'Dänemark', waehrung: 'DKK', notruf: { 'Notruf': '112' } },
  IS: { name: 'Island', waehrung: 'ISK', notruf: { 'Notruf': '112' } },
  GB: { name: 'Vereinigtes Königreich', waehrung: 'GBP', notruf: { 'Notruf': '999', 'Alternativ': '112' } },
  IE: { name: 'Irland', waehrung: 'EUR', notruf: { 'Notruf': '112', 'Alternativ': '999' } },
  TR: { name: 'Türkei', waehrung: 'TRY', notruf: { 'Notruf': '112' } },
  US: { name: 'USA', waehrung: 'USD', notruf: { 'Notruf': '911' } },
  CA: { name: 'Kanada', waehrung: 'CAD', notruf: { 'Notruf': '911' } },
  MX: { name: 'Mexiko', waehrung: 'MXN', notruf: { 'Notruf': '911' } },
  BR: { name: 'Brasilien', waehrung: 'BRL', notruf: { 'Polizei': '190', 'Rettung': '192', 'Feuerwehr': '193' } },
  AR: { name: 'Argentinien', waehrung: 'ARS', notruf: { 'Polizei': '911', 'Rettung': '107', 'Feuerwehr': '100' } },
  AU: { name: 'Australien', waehrung: 'AUD', notruf: { 'Notruf': '000', 'Handy alternativ': '112' } },
  NZ: { name: 'Neuseeland', waehrung: 'NZD', notruf: { 'Notruf': '111' } },
  JP: { name: 'Japan', waehrung: 'JPY', notruf: { 'Polizei': '110', 'Feuerwehr/Rettung': '119' } },
  KR: { name: 'Südkorea', waehrung: 'KRW', notruf: { 'Polizei': '112', 'Feuerwehr/Rettung': '119' } },
  CN: { name: 'China', waehrung: 'CNY', notruf: { 'Polizei': '110', 'Rettung': '120', 'Feuerwehr': '119' } },
  TH: { name: 'Thailand', waehrung: 'THB', notruf: { 'Polizei': '191', 'Rettung': '1669', 'Touristenpolizei': '1155' } },
  VN: { name: 'Vietnam', waehrung: 'VND', notruf: { 'Polizei': '113', 'Feuerwehr': '114', 'Rettung': '115' } },
  PH: { name: 'Philippinen', waehrung: 'PHP', notruf: { 'Notruf': '911' } },
  ID: { name: 'Indonesien', waehrung: 'IDR', notruf: { 'Notruf': '112', 'Polizei': '110', 'Rettung': '118' } },
  MY: { name: 'Malaysia', waehrung: 'MYR', notruf: { 'Notruf': '999', 'Handy alternativ': '112' } },
  SG: { name: 'Singapur', waehrung: 'SGD', notruf: { 'Polizei': '999', 'Feuerwehr/Rettung': '995' } },
  IN: { name: 'Indien', waehrung: 'INR', notruf: { 'Notruf': '112' } },
  AE: { name: 'Vereinigte Arabische Emirate', waehrung: 'AED', notruf: { 'Polizei': '999', 'Rettung': '998', 'Feuerwehr': '997' } },
  IL: { name: 'Israel', waehrung: 'ILS', notruf: { 'Polizei': '100', 'Rettung': '101', 'Feuerwehr': '102' } },
  ZA: { name: 'Südafrika', waehrung: 'ZAR', notruf: { 'Polizei': '10111', 'Rettung': '10177', 'Handy': '112' } },
  GE: { name: 'Georgien', waehrung: 'GEL', notruf: { 'Notruf': '112' } },
};

export function landName(code, fallback) {
  return LAENDER[code]?.name ?? fallback ?? code;
}

// Sätze für den Notfall. Bewusst kurz und in einfacher Sprache.
export const SAETZE = [
  { de: 'Ich brauche Hilfe.', en: 'I need help.', es: 'Necesito ayuda.', fr: "J'ai besoin d'aide.", pt: 'Preciso de ajuda.', it: 'Ho bisogno di aiuto.', tr: 'Yardıma ihtiyacım var.' },
  { de: 'Bitte rufen Sie einen Krankenwagen.', en: 'Please call an ambulance.', es: 'Por favor, llame a una ambulancia.', fr: 'Appelez une ambulance, s’il vous plaît.', pt: 'Por favor, chame uma ambulância.', it: "Per favore, chiami un'ambulanza.", tr: 'Lütfen ambulans çağırın.' },
  { de: 'Bitte rufen Sie die Polizei.', en: 'Please call the police.', es: 'Por favor, llame a la policía.', fr: 'Appelez la police, s’il vous plaît.', pt: 'Por favor, chame a polícia.', it: 'Per favore, chiami la polizia.', tr: 'Lütfen polisi arayın.' },
  { de: 'Wo ist das nächste Krankenhaus?', en: 'Where is the nearest hospital?', es: '¿Dónde está el hospital más cercano?', fr: 'Où est l’hôpital le plus proche ?', pt: 'Onde fica o hospital mais próximo?', it: "Dov'è l'ospedale più vicino?", tr: 'En yakın hastane nerede?' },
  { de: 'Ich spreche die Sprache nicht gut.', en: "I don't speak English well.", es: 'No hablo bien español.', fr: 'Je ne parle pas bien français.', pt: 'Não falo bem português.', it: 'Non parlo bene italiano.', tr: 'Türkçeyi iyi konuşamıyorum.' },
  { de: 'Ich bin deutscher Staatsbürger / deutsche Staatsbürgerin.', en: 'I am a German citizen.', es: 'Soy ciudadano/a alemán/alemana.', fr: 'Je suis citoyen(ne) allemand(e).', pt: 'Sou cidadão/cidadã alemão/alemã.', it: 'Sono cittadino/a tedesco/a.', tr: 'Alman vatandaşıyım.' },
  { de: 'Ich habe meinen Pass verloren.', en: 'I have lost my passport.', es: 'He perdido mi pasaporte.', fr: "J'ai perdu mon passeport.", pt: 'Perdi o meu passaporte.', it: 'Ho perso il passaporto.', tr: 'Pasaportumu kaybettim.' },
  { de: 'Ich bin allergisch gegen …', en: "I'm allergic to …", es: 'Soy alérgico/a a …', fr: 'Je suis allergique à …', pt: 'Sou alérgico/a a …', it: 'Sono allergico/a a …', tr: '… alerjim var.' },
  { de: 'Ich suche eine Wohnung.', en: "I'm looking for an apartment.", es: 'Busco un piso.', fr: 'Je cherche un appartement.', pt: 'Procuro um apartamento.', it: 'Cerco un appartamento.', tr: 'Kiralık daire arıyorum.' },
  { de: 'Wie viel kostet das?', en: 'How much does it cost?', es: '¿Cuánto cuesta?', fr: 'Combien ça coûte ?', pt: 'Quanto custa?', it: 'Quanto costa?', tr: 'Bu ne kadar?' },
];

export const SPRACHEN = { en: 'Englisch', es: 'Spanisch', fr: 'Französisch', pt: 'Portugiesisch', it: 'Italienisch', tr: 'Türkisch' };
