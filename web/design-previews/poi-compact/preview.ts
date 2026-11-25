type Poi = { id: number; name: string; purpose: string; u: number; v: number; camera: string }
const points: Poi[] = [
  { id: 1, name: 'C', purpose: 'quan sát', u: 500, v: 420, camera: 'PAN 90° phải, TILT 0°' },
  { id: 2, name: 'B', purpose: 'quan sát', u: 520, v: 650, camera: 'Chưa có trong ảnh tham chiếu' },
  { id: 3, name: 'E', purpose: 'quan sát', u: 550, v: 950, camera: 'Chưa có trong ảnh tham chiếu' },
  { id: 4, name: 'A', purpose: 'quan sát', u: 590, v: 1230, camera: 'Chưa có trong ảnh tham chiếu' },
  { id: 5, name: 'Test 2', purpose: 'quan sát', u: 690, v: 1500, camera: 'Chưa có trong ảnh tham chiếu' },
  { id: 6, name: 'Điểm 6', purpose: 'quan sát', u: 1120, v: 980, camera: 'Dữ liệu minh họa' },
]
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T
const search = $<HTMLInputElement>('search'), statusFilter = $<HTMLSelectElement>('status'), deployed = $<HTMLInputElement>('deployed'), sort = $<HTMLSelectElement>('sort')
let selectedId = 1
const initialView = { x: 180, y: 100, width: 1200, height: 1750 }
let view = { ...initialView }
const map = document.getElementById('map-svg') as unknown as SVGSVGElement
const params = () => new URLSearchParams(location.search)
function read() {
  const p = params()
  search.value = p.get('search') ?? ''
  statusFilter.value = ['all', 'DRAFT', 'WAIT', 'PASS', 'FAIL', 'RETIRED'].includes(p.get('status') ?? '') ? p.get('status')! : 'all'
  sort.value = ['original', 'name', 'name-desc'].includes(p.get('sort') ?? '') ? p.get('sort')! : 'original'
  deployed.checked = p.get('deployed') === '1'
  selectedId = points.some(point => point.id === Number(p.get('poi'))) ? Number(p.get('poi')) : 1
}
function persist(push = false) {
  const p = params()
  for (const [key, value, fallback] of [['search', search.value, ''], ['status', statusFilter.value, 'all'], ['sort', sort.value, 'original'], ['deployed', deployed.checked ? '1' : '0', '0'], ['poi', String(selectedId), '1']]) { if (value === fallback) p.delete(key); else p.set(key, value) }
  const target = `${location.pathname}${p.size ? `?${p}` : ''}`
  if (push) history.pushState(null, '', target); else history.replaceState(null, '', target)
}
function select(id: number) { selectedId = id; persist(true); render() }
function render() {
  let rows = points.filter(p => `${p.name} ${p.purpose}`.toLocaleLowerCase('vi').includes(search.value.trim().toLocaleLowerCase('vi')))
  if (deployed.checked || (statusFilter.value !== 'all' && statusFilter.value !== 'PASS')) rows = []
  if (sort.value !== 'original') rows.sort((a, b) => a.name.localeCompare(b.name, 'vi', { numeric: true }) * (sort.value === 'name-desc' ? -1 : 1))
  const selected = rows.find(point => point.id === selectedId) ?? rows[0]
  if (selected) selectedId = selected.id
  $('count').textContent = `${rows.length} điểm`
  $('map-count').textContent = `${rows.length} điểm trên bản đồ`
  $('table-region').hidden = !rows.length
  $('empty-state').hidden = !!rows.length
  $('poi-detail').hidden = !selected
  $('empty-state').querySelector('p')!.textContent = deployed.checked ? 'Demo chưa có dữ liệu triển khai trên robot. Bỏ bộ lọc để xem lại các điểm.' : 'Thử tên khác hoặc bỏ bộ lọc để xem lại danh sách.'
  $('poi-rows').innerHTML = rows.map(point => `<tr data-poi="${point.id}" aria-selected="${point.id === selectedId}"><td><button class="poi-row-button" type="button" data-select="${point.id}" aria-pressed="${point.id === selectedId}"><span class="poi-index">${point.id}</span><span><strong>${point.name}</strong><small>${point.purpose}</small></span></button></td><td><span class="poi-statusFilter"><svg aria-hidden="true"><use href="#check"/></svg>Đạt</span></td><td><span class="poi-statusFilter"><svg aria-hidden="true"><use href="#check"/></svg>Đã duyệt</span></td></tr>`).join('')
  const pins = document.getElementById('map-pins')!
  const box = map.getBoundingClientRect(), unit = Math.max(view.width / Math.max(1, box.width), view.height / Math.max(1, box.height))
  pins.innerHTML = rows.map(point => `<g class="poi-pin" role="button" tabindex="0" aria-label="Chọn điểm ${point.name}, số ${point.id}" aria-pressed="${point.id === selectedId}" data-select="${point.id}" transform="translate(${point.u} ${point.v})"><circle class="poi-pin-hit" r="${22 * unit}"/>${point.id === selectedId ? `<circle class="poi-pin-ring" r="${18 * unit}"/>` : ''}<circle r="${14 * unit}"/><text style="font-size:${12 * unit}px">${point.id}</text></g>`).join('') + (selected ? `<g class="poi-pin-label" transform="translate(${selected.u + 24 * unit} ${selected.v - 14 * unit})"><rect width="${90 * unit}" height="${28 * unit}" rx="${5 * unit}"/><text x="${8 * unit}" y="${19 * unit}" style="font-size:${12 * unit}px">${selected.id} / ${selected.name}</text></g>` : '')

  if (selected) {
    $('selected-name').textContent = `Điểm ${selected.name}`
    $('camera-value').textContent = selected.camera
    $('proposal-title').textContent = `Đề xuất điểm ${selected.name}`
    $('delete-title').textContent = `Xoá điểm ${selected.name}?`
  }
  $('announcement').textContent = selected ? `Đang chọn điểm ${selected.name}. ${rows.length} điểm phù hợp.` : 'Không có điểm phù hợp với bộ lọc.'
}
function renderView() {
  map.setAttribute('viewBox', `${view.x} ${view.y} ${view.width} ${view.height}`)
  $<HTMLButtonElement>('zoom-in').disabled = view.width <= 300
  $<HTMLButtonElement>('zoom-out').disabled = view.width >= 2000
}
function zoom(factor: number) {
  const width = Math.max(300, Math.min(2000, view.width * factor)), ratio = width / view.width
  view = { x: view.x + (view.width - width) / 2, y: view.y + view.height * (1 - ratio) / 2, width, height: view.height * ratio }
  renderView(); render()
}
document.addEventListener('click', event => {
  const target = (event.target as Element).closest('[data-select]')
  if (target) select(Number(target.getAttribute('data-select')))
})
map.addEventListener('keydown', event => {
  const target = (event.target as Element).closest('[data-select]')
  if (target && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); select(Number(target.getAttribute('data-select'))) }
})
search.addEventListener('input', () => { render(); persist() })
for (const control of [statusFilter, deployed, sort]) control.addEventListener('change', () => { render(); persist(true) })
$('filters').addEventListener('submit', event => event.preventDefault())
$('reset-filters').addEventListener('click', () => { search.value = ''; statusFilter.value = 'all'; deployed.checked = false; render(); persist(true); search.focus() })
$('zoom-in').addEventListener('click', () => zoom(.8))
$('zoom-out').addEventListener('click', () => zoom(1.25))
$('zoom-fit').addEventListener('click', () => { view = { ...initialView }; renderView(); render() })
let drag: { x: number; y: number; vx: number; vy: number; pointer: number } | null = null
map.addEventListener('pointerdown', event => {
  if ((event.target as Element).closest('[data-select]')) return
  drag = { x: event.clientX, y: event.clientY, vx: view.x, vy: view.y, pointer: event.pointerId }; map.setPointerCapture(event.pointerId)
})
map.addEventListener('pointermove', event => {
  if (!drag || event.pointerId !== drag.pointer) return
  const rect = map.getBoundingClientRect(), unit = Math.max(view.width / rect.width, view.height / rect.height)
  view.x = drag.vx - (event.clientX - drag.x) * unit; view.y = drag.vy - (event.clientY - drag.y) * unit; renderView()
})
map.addEventListener('pointerup', () => { drag = null }); map.addEventListener('pointercancel', () => { drag = null })
$('fullscreen').addEventListener('click', async () => {
  try { if (document.fullscreenElement) await document.exitFullscreen(); else await $('map-panel').requestFullscreen() }
  catch { $('announcement').textContent = 'Trình duyệt không hỗ trợ mở bản đồ toàn màn hình.' }
})
$('view-proposal').addEventListener('click', () => $<HTMLDialogElement>('proposal-dialog').showModal())
$('delete-poi').addEventListener('click', () => { $('actions-menu').hidePopover(); $<HTMLDialogElement>('delete-dialog').showModal() })
document.querySelectorAll<HTMLButtonElement>('[data-close]').forEach(button => button.addEventListener('click', () => $<HTMLDialogElement>(button.dataset.close!).close()))
document.querySelectorAll<HTMLDialogElement>('dialog').forEach(dialog => dialog.addEventListener('click', event => { if (event.target === dialog) { const r = dialog.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) dialog.close() } }))
const menu = $('menu-button'), sidebar = $('navigation')
const closeMenu = () => { sidebar.classList.remove('is-open'); menu.setAttribute('aria-expanded', 'false') }
menu.addEventListener('click', () => { const open = sidebar.classList.toggle('is-open'); menu.setAttribute('aria-expanded', String(open)) })
document.addEventListener('keydown', event => { if (event.key === 'Escape' && sidebar.classList.contains('is-open')) { closeMenu(); menu.focus() } })
document.addEventListener('click', event => { if (!sidebar.contains(event.target as Node) && !menu.contains(event.target as Node)) closeMenu() })
addEventListener('popstate', () => { read(); render() })
read(); render(); renderView()
new ResizeObserver(() => render()).observe(map)
const state = params().get('state')
if (['loading', 'empty', 'error'].includes(state ?? '')) {
  $('poi-workspace').hidden = true
  $('global-state').hidden = false
  $('global-state').innerHTML = state === 'loading' ? '<div class="poi-empty"><h3>Đang tải danh sách điểm…</h3><div class="poi-skeleton" aria-hidden="true"></div><div class="poi-skeleton" aria-hidden="true"></div><p>Đang tải bản đồ và các điểm tham quan.</p><a class="button" href="?">Xem dữ liệu mẫu</a></div>' : state === 'error' ? '<div class="poi-empty"><h3>Không tải được danh sách POI</h3><p>Đây là trạng thái lỗi minh họa.</p><a class="button" href="?">Thử lại bản demo</a></div>' : '<div class="poi-empty"><h3>Chưa có điểm trên bản đồ</h3><p>Các điểm sẽ xuất hiện tại đây sau khi được tạo.</p><a class="button" href="/staff/manage/pois/new" target="_blank" rel="noopener">Tạo điểm mới</a><p><a href="?">Quay lại dữ liệu mẫu</a></p></div>'
  $('global-state').setAttribute('aria-busy', String(state === 'loading'))
}
