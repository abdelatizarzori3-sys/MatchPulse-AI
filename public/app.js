const state = { matches: [], english: false, competition: '', status: '', favoriteTeams: [], selectedMatchIds: new Set() };
const $ = (selector) => document.querySelector(selector);
const labels = {
  ar: {
    pageTitle: 'MatchPulse AI — جدول المباريات',
    lead: 'جدول مباريات حقيقي وتحليل احتمالي مفسّر، دون ادعاء نتيجة مضمونة.',
    loading: 'جاري تحميل جدول المباريات…',
    noData: 'لا توجد مباريات حقيقية متاحة. أضف مفتاح المصدر إلى الخادم.',
    error: 'تعذر جلب المباريات. حاول لاحقًا.',
    analyze: 'تحليل OBTA',
    status: 'الحالة', source: 'المصدر', confidence: 'الثقة النموذجية', home: 'فوز صاحب الأرض', draw: 'تعادل', away: 'فوز الضيف', method: 'المنهج', summary: 'تحليل جماعي', all: 'كل البطولات',
    countLabel: 'مباراة في المصدر', refresh: 'تحديث الجدول', competitionFilter: 'تصفية البطولة', statusFilter: 'تصفية الحالة',
    favorites: 'الفرق المفضلة', calendarHelp: 'اختر فرقك المفضلة لتصفية الجدول، ثم حدّد مباريات حقيقية لتصديرها بتوقيت UTC.',
    exportCalendar: 'تصدير المحدد إلى ICS · Pro', select: 'تحديد', date: 'الموعد', competition: 'البطولة', match: 'المباراة', analysis: 'التحليل',
    selected: (count) => `المحدد للتصدير: ${count}`,
    proHint: 'تصدير التقويم متاح فقط لاشتراك Pro موثّق من الخادم.',
    chooseMatch: 'حدّد مباراة واحدة على الأقل لتصديرها.', exporting: 'يجري التحقق من الاشتراك وإنشاء تقويم UTC…',
    exportSuccess: 'تم تنزيل ملف ICS للمباريات المحددة.',
    purchaseSetup: 'تصدير التقويم ميزة Pro. إعداد شراء الاشتراك والتحقق الخادمي مطلوب قبل إتاحته.',
    subscriptionRequired: 'يتطلب التصدير اشتراك Pro نشطًا ومثبتًا من الخادم.',
    signInRequired: 'سجّل الدخول إلى الحساب المرتبط باشتراك Pro ثم حاول مجددًا.',
    exportUnavailable: 'تعذر التحقق من الاشتراك أو إنشاء التقويم حاليًا. حاول لاحقًا.',
    responsibleUse: 'تحليل احتمالي لا يمثل نصيحة مراهنة',
    statuses: { '': 'كل الحالات', SCHEDULED: 'مجدولة', IN_PLAY: 'مباشرة', FINISHED: 'منتهية' },
  },
  en: {
    pageTitle: 'MatchPulse AI — Fixtures',
    lead: 'Real football fixtures with explainable probability analysis, without claiming a guaranteed result.',
    loading: 'Loading real fixtures…',
    noData: 'No real fixtures are available. Configure the provider token on the server.',
    error: 'Could not fetch fixtures. Try again later.',
    analyze: 'OBTA analysis',
    status: 'Status', source: 'Source', confidence: 'Model confidence', home: 'Home win', draw: 'Draw', away: 'Away win', method: 'Method', summary: 'Batch analysis', all: 'All competitions',
    countLabel: 'fixtures in source', refresh: 'Refresh fixtures', competitionFilter: 'Filter competition', statusFilter: 'Filter status',
    favorites: 'Favorite teams', calendarHelp: 'Choose favorite teams to filter the real schedule, then select fixtures to export in UTC.',
    exportCalendar: 'Export selected to ICS · Pro', select: 'Select', date: 'Date', competition: 'Competition', match: 'Match', analysis: 'Analysis',
    selected: (count) => `Selected for export: ${count}`,
    proHint: 'Calendar export is available only with a server-verified Pro subscription.',
    chooseMatch: 'Select at least one fixture to export.', exporting: 'Verifying subscription and creating a UTC calendar…',
    exportSuccess: 'The ICS file for the selected fixtures was downloaded.',
    purchaseSetup: 'Calendar export is a Pro feature. Server-side purchase and entitlement setup is required before it can be used.',
    subscriptionRequired: 'Calendar export requires an active Pro subscription verified by the server.',
    signInRequired: 'Sign in to the account connected to a Pro subscription, then try again.',
    exportUnavailable: 'Subscription verification or calendar export is temporarily unavailable. Try again later.',
    responsibleUse: 'Probability analysis is not betting advice',
    statuses: { '': 'All statuses', SCHEDULED: 'Scheduled', IN_PLAY: 'Live', FINISHED: 'Finished' },
  },
};
const t = () => labels[state.english ? 'en' : 'ar'];

function formatDate(value) {
  return new Intl.DateTimeFormat(state.english ? 'en' : 'ar-MA', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function probabilityClass(value) { return value >= 55 ? 'good' : value >= 35 ? 'mid' : 'risk'; }
function matchId(match) { return String(match.id); }
function hasFavoriteTeam(match) { return state.favoriteTeams.length === 0 || state.favoriteTeams.includes(match.home) || state.favoriteTeams.includes(match.away); }
function visibleMatches() {
  return state.matches
    .filter((match) => (!state.competition || match.competition === state.competition) && (!state.status || match.status === state.status) && hasFavoriteTeam(match))
    .sort((a, b) => new Date(a.utcDate) - new Date(b.utcDate));
}

function option(value, text, selected = false) {
  const item = document.createElement('option');
  item.value = value;
  item.textContent = text;
  item.selected = selected;
  return item;
}

function updateCompetitionOptions() {
  const select = $('#competitionFilter');
  const names = [...new Set(state.matches.map((match) => match.competition))].sort((a, b) => a.localeCompare(b));
  if (!names.includes(state.competition)) state.competition = '';
  select.replaceChildren(option('', t().all, !state.competition), ...names.map((name) => option(name, name, name === state.competition)));
}

function updateStatusOptions() {
  const select = $('#statusFilter');
  const statusValues = ['', 'SCHEDULED', 'IN_PLAY', 'FINISHED'];
  if (!statusValues.includes(state.status)) state.status = '';
  select.replaceChildren(...statusValues.map((value) => option(value, t().statuses[value], value === state.status)));
}

function updateFavoriteOptions() {
  const select = $('#favoriteTeams');
  const teams = [...new Set(state.matches.flatMap((match) => [match.home, match.away]))].sort((a, b) => a.localeCompare(b));
  state.favoriteTeams = state.favoriteTeams.filter((team) => teams.includes(team));
  select.replaceChildren(...teams.map((team) => option(team, team, state.favoriteTeams.includes(team))));
}

function pruneSelectionToVisible() {
  const visibleIds = new Set(visibleMatches().map(matchId));
  for (const id of state.selectedMatchIds) {
    if (!visibleIds.has(id)) state.selectedMatchIds.delete(id);
  }
}

function appendCell(row, content, className = '') {
  const cell = document.createElement('td');
  if (className) cell.className = className;
  if (typeof content === 'string') cell.textContent = content;
  else if (content) cell.append(content);
  row.append(cell);
  return cell;
}

function buildMatchCell(match) {
  const fragment = document.createDocumentFragment();
  const home = document.createElement('strong');
  home.textContent = match.home;
  const versus = document.createElement('span');
  versus.className = 'versus';
  versus.textContent = '×';
  const away = document.createElement('strong');
  away.textContent = match.away;
  fragment.append(home, versus, away);
  return fragment;
}

function buildSelectionCell(match) {
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.className = 'match-select';
  input.checked = state.selectedMatchIds.has(matchId(match));
  input.setAttribute('aria-label', `${t().select}: ${match.home} × ${match.away}`);
  input.addEventListener('change', () => {
    if (input.checked) state.selectedMatchIds.add(matchId(match));
    else state.selectedMatchIds.delete(matchId(match));
    updateSelectionState();
  });
  return input;
}

function buildAnalyzeButton(match) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'analyze';
  button.textContent = t().analyze;
  button.addEventListener('click', () => openAnalysis(matchId(match)));
  return button;
}

function updateStaticLabels() {
  document.title = t().pageTitle;
  $('#lead').textContent = t().lead;
  $('#language').textContent = state.english ? 'العربية' : 'English';
  $('#countLabel').textContent = t().countLabel;
  $('#refresh').textContent = t().refresh;
  $('#competitionFilter').setAttribute('aria-label', t().competitionFilter);
  $('#statusFilter').setAttribute('aria-label', t().statusFilter);
  $('#favoriteTeamsLabel').textContent = t().favorites;
  $('#calendarHelp').textContent = t().calendarHelp;
  $('#exportCalendar').textContent = t().exportCalendar;
  $('#selectHead').textContent = t().select;
  $('#dateHead').textContent = t().date;
  $('#competitionHead').textContent = t().competition;
  $('#matchHead').textContent = t().match;
  $('#statusHead').textContent = t().status;
  $('#analysisHead').textContent = t().analysis;
  $('#responsibleUse').textContent = t().responsibleUse;
}

function updateSelectionState() {
  const count = state.selectedMatchIds.size;
  $('#selectionSummary').textContent = count ? t().selected(count) : '';
  $('#exportCalendar').disabled = count === 0;
}

function render() {
  updateStaticLabels();
  const matches = visibleMatches();
  $('#count').textContent = matches.length;
  const analysed = matches.filter((match) => match.prediction).length;
  $('#summary').textContent = `${t().summary}: ${analysed}/${matches.length}`;
  const body = $('#matches');
  body.replaceChildren();
  if (matches.length === 0) {
    const row = document.createElement('tr');
    const cell = appendCell(row, t().noData, 'empty');
    cell.colSpan = 6;
    body.append(row);
  } else {
    for (const match of matches) {
      const row = document.createElement('tr');
      appendCell(row, buildSelectionCell(match));
      appendCell(row, formatDate(match.utcDate));
      appendCell(row, match.competition);
      appendCell(row, buildMatchCell(match));
      const status = document.createElement('span');
      status.className = 'status';
      status.textContent = match.status;
      appendCell(row, status);
      appendCell(row, buildAnalyzeButton(match));
      body.append(row);
    }
  }
  updateSelectionState();
}

function textBlock(text, className = '') {
  const element = document.createElement('span');
  element.textContent = text;
  if (className) element.className = className;
  return element;
}

function openAnalysis(id) {
  const match = state.matches.find((item) => matchId(item) === id);
  if (!match?.prediction) return;
  const prediction = match.prediction;
  $('#modal-title').textContent = `${match.home} × ${match.away}`;
  const body = $('#modal-body');
  const sourceRow = document.createElement('div');
  sourceRow.className = 'source-row';
  const source = document.createElement('span');
  source.append(`${t().source}: `, textBlock(match.competition));
  const matchStatus = document.createElement('span');
  matchStatus.append(`${t().status}: `, textBlock(match.status));
  sourceRow.append(source, matchStatus);
  const probabilities = document.createElement('div');
  probabilities.className = 'probabilities';
  for (const [label, value] of [[t().home, prediction.home], [t().draw, prediction.draw], [t().away, prediction.away]]) {
    const item = document.createElement('div');
    item.className = `prob ${probabilityClass(value)}`;
    item.append(textBlock(label), textBlock(`${value}%`));
    probabilities.append(item);
  }
  const confidence = document.createElement('div');
  confidence.className = 'confidence';
  confidence.append(textBlock(t().confidence), textBlock(`${prediction.confidence}%`));
  const method = document.createElement('p');
  method.className = 'method';
  method.textContent = `${t().method}: ${prediction.method}. ${prediction.disclaimer}`;
  body.replaceChildren(sourceRow, probabilities, confidence, method);
  $('#obta').showModal();
}

function setCalendarNotice(message) { $('#calendarNotice').textContent = message; }

async function loadMatches() {
  $('#notice').textContent = t().loading;
  try {
    const response = await fetch('/api/matches?status=SCHEDULED');
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    state.matches = Array.isArray(data.matches) ? data.matches : [];
    updateCompetitionOptions();
    updateStatusOptions();
    updateFavoriteOptions();
    pruneSelectionToVisible();
    $('#notice').textContent = data.configured ? `${data.source} · ${data.fetchedAt ? formatDate(data.fetchedAt) : ''}` : data.message || t().noData;
  } catch {
    state.matches = [];
    state.selectedMatchIds.clear();
    updateCompetitionOptions();
    updateStatusOptions();
    updateFavoriteOptions();
    $('#notice').textContent = t().error;
  }
  render();
}

async function exportCalendar() {
  const matchIds = [...state.selectedMatchIds];
  if (matchIds.length === 0) {
    setCalendarNotice(t().chooseMatch);
    return;
  }
  $('#exportCalendar').disabled = true;
  setCalendarNotice(t().exporting);
  try {
    const response = await fetch('/api/pro/calendar-export', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ matchIds, favoriteTeams: state.favoriteTeams }),
    });
    if (!response.ok) {
      let data = {};
      try { data = await response.json(); } catch { /* The response is handled as a generic failure below. */ }
      if (data.error === 'PURCHASE_SETUP_REQUIRED') setCalendarNotice(t().purchaseSetup);
      else if (data.error === 'AUTHENTICATION_REQUIRED') setCalendarNotice(t().signInRequired);
      else if (data.error === 'ENTITLEMENT_REQUIRED') setCalendarNotice(t().subscriptionRequired);
      else setCalendarNotice(t().exportUnavailable);
      return;
    }
    const calendar = await response.blob();
    const url = URL.createObjectURL(calendar);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'matchpulse-fixtures.ics';
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setCalendarNotice(t().exportSuccess);
  } catch {
    setCalendarNotice(t().exportUnavailable);
  } finally {
    updateSelectionState();
  }
}

$('#refresh').addEventListener('click', loadMatches);
$('#competitionFilter').addEventListener('change', (event) => {
  state.competition = event.target.value;
  pruneSelectionToVisible();
  render();
});
$('#statusFilter').addEventListener('change', (event) => {
  state.status = event.target.value;
  pruneSelectionToVisible();
  render();
});
$('#favoriteTeams').addEventListener('change', (event) => {
  state.favoriteTeams = [...event.target.selectedOptions].map((item) => item.value);
  pruneSelectionToVisible();
  render();
});
$('#exportCalendar').addEventListener('click', exportCalendar);
$('#close').addEventListener('click', () => $('#obta').close());
$('#language').addEventListener('click', async () => {
  state.english = !state.english;
  document.documentElement.lang = state.english ? 'en' : 'ar';
  document.documentElement.dir = state.english ? 'ltr' : 'rtl';
  updateCompetitionOptions();
  updateStatusOptions();
  updateFavoriteOptions();
  setCalendarNotice(t().proHint);
  render();
  await loadMatches();
});

setCalendarNotice(t().proHint);
loadMatches();
