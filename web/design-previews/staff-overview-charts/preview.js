const params = new URLSearchParams(location.search);
let activeFilter = params.get('view') ?? 'all';
function filterTours(filter) {
  activeFilter = filter;
  document.querySelectorAll('[data-filter]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.filter === filter)));
  document.querySelectorAll('tr[data-state]').forEach(row => { row.hidden = filter !== 'all' && row.dataset.state !== filter; });
  const next = new URL(location.href);
  if (filter === 'all') next.searchParams.delete('view'); else next.searchParams.set('view', filter);
  history.replaceState(null, '', next);
}
document.querySelectorAll('[data-filter]').forEach(button => button.addEventListener('click', () => filterTours(button.dataset.filter)));
filterTours(['all', 'RUNNING', 'READY', 'SCHEDULED'].includes(activeFilter) ? activeFilter : 'all');
function setScope(scope) {
  const mine = scope === 'mine';
  document.querySelectorAll('[data-scope]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.scope === scope)));
  const next = new URL(location.href);
  if (mine) next.searchParams.set('mine', '1'); else next.searchParams.delete('mine');
  history.replaceState(null, '', next);
  // All three of today's fixture Tours belong to the signed-in Staff.
  document.querySelector('.subtle-label').textContent = mine ? '3 Tour tôi vận hành' : '4 Tour trong lịch';
  document.querySelector('.chart-bars .future-bar').style.display = mine ? 'none' : '';
  document.querySelectorAll('.value-label text')[1].style.display = mine ? 'none' : '';
  document.getElementById('chart-description').textContent = mine
    ? 'Ngày 13/11 có 3 Tour do Nguyễn Minh Anh vận hành. Các ngày khác không có Tour của người này.'
    : 'Ngày 13/11 có 3 Tour, ngày 17/11 có 1 Tour. Các ngày khác không có Tour.';
}
document.querySelectorAll('[data-scope]').forEach(button => button.addEventListener('click', () => setScope(button.dataset.scope)));
if (params.get('mine') === '1') setScope('mine');

const routeVisual = document.getElementById('route-visual');
const routeMap = routeVisual.querySelector('.route-map');
const routeOptions = document.querySelector('.route-options');
const routeNote = document.getElementById('route-note');
const diagramButtons = [...routeOptions.querySelectorAll('[data-diagram]')];
function setDiagram(layout) {
  routeVisual.dataset.layout = layout;
  routeMap.toggleAttribute('hidden', layout !== 'map');
  routeNote.textContent = layout === 'map'
    ? 'Tọa độ điểm dừng lấy từ dữ liệu mẫu. Nét nối chỉ thể hiện thứ tự.'
    : 'Thứ tự điểm dừng của Tour.';
  diagramButtons.forEach(button => {
    button.setAttribute('aria-pressed', String(button.dataset.diagram === layout));
  });
  const next = new URL(location.href);
  if (layout === 'horizontal') next.searchParams.delete('diagram');
  else next.searchParams.set('diagram', layout);
  history.replaceState(null, '', next);
}
routeOptions.hidden = false;
diagramButtons.forEach(button => button.addEventListener('click', () => setDiagram(button.dataset.diagram)));
const initialDiagram = diagramButtons.find(button => button.dataset.diagram === params.get('diagram'));
if (initialDiagram) setDiagram(initialDiagram.dataset.diagram);

const menu = document.getElementById('menu-button');
const sidebar = document.getElementById('navigation');
const closeMenu = () => { sidebar.classList.remove('is-open'); menu.setAttribute('aria-expanded', 'false'); };
menu.addEventListener('click', () => {
  const open = sidebar.classList.toggle('is-open');
  menu.setAttribute('aria-expanded', String(open));
  if (open) sidebar.querySelector('a').focus();
});
sidebar.querySelectorAll('a').forEach(link => link.addEventListener('click', closeMenu));
document.addEventListener('keydown', event => { if (event.key === 'Escape') { closeMenu(); menu.focus(); } });
document.addEventListener('click', event => { if (!sidebar.contains(event.target) && !menu.contains(event.target)) closeMenu(); });
const state = params.get('state');
if (['empty', 'error', 'loading'].includes(state)) {
  const main = document.querySelector('.main');
  main.querySelectorAll('section, .charts-grid, .work-grid, .day-toolbar').forEach(region => region.remove());
  const screen = document.createElement('section');
  screen.className = 'state-screen';
  screen.setAttribute('aria-live', 'polite');
  if (state === 'empty') screen.innerHTML = '<svg aria-hidden="true"><use href="#calendar"/></svg><h2>Chưa có Tour trong ngày</h2><p>Lịch Tour và công việc sẽ xuất hiện tại đây khi có dữ liệu.</p><a class="button" href="?">Quay lại dữ liệu mẫu</a>';
  if (state === 'error') screen.innerHTML = '<svg aria-hidden="true"><use href="#info"/></svg><h2>Không tải được tổng quan</h2><p>Đây là trạng thái lỗi minh họa. Trong ứng dụng, dữ liệu cũ được giữ lại khi cập nhật thất bại.</p><a class="button" href="?">Thử lại bản mẫu</a>';
  if (state === 'loading') { screen.setAttribute('aria-busy', 'true'); screen.innerHTML = '<p role="status">Đang tải dữ liệu tổng quan…</p><div class="skeleton-grid" aria-hidden="true"><div class="skeleton-line"></div><div class="skeleton-line"></div><div class="skeleton-line"></div></div><a class="text-link" href="?">Quay lại dữ liệu mẫu</a>'; }
  main.insertBefore(screen, main.querySelector('footer'));
}
