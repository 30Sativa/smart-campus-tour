import { bounds, buckets, CUTOFF, dayKey, daysInMonth, readFilters, selectTours, stateLabels, summarize, type Period, type State } from './report-data.ts'

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T
const number = (n: number) => n.toLocaleString('vi-VN')
const percentage = (n: number | null) => n === null ? '—' : `${n.toLocaleString('vi-VN', { maximumFractionDigits: 1 })}%`
let filters = readFilters(location.search)
let tableRows: ReturnType<typeof buckets> = []
const isFuture = (value: number) => dayKey(filters.year, filters.period === 'month' ? filters.month : value, filters.period === 'month' ? value : 1) > CUTOFF
const monthSelect = $<HTMLSelectElement>('month')
monthSelect.innerHTML = Array.from({ length: 12 }, (_, i) => `<option value="${i + 1}">Tháng ${i + 1}</option>`).join('')

function save() {
  const p = new URLSearchParams(location.search)
  for (const [key, value] of Object.entries(filters)) p.set(key, typeof value === 'boolean' ? value ? '1' : '0' : String(value))
  history.pushState({}, '', `${location.pathname}?${p}`)
  render()
}
function drill(month: number) { filters.period = 'month'; filters.month = month; save(); $('filters').scrollIntoView({ block: 'nearest' }) }
function renderChart() {
  const data = tableRows
  const comparison = filters.compare && filters.year === 2026
  const width = 640, height = 210, left = 30, top = 20, bottom = 25, plot = height - top - bottom
  const max = Math.max(1, ...data.map(d => d.rows.length), ...(comparison ? data.map(d => d.previous.length) : []))
  const step = Math.max(1, Math.ceil(max / 4)), ceiling = step * 4
  const group = (width - left - 8) / data.length, bar = Math.min(18, group * (comparison ? .28 : .46))
  const y = (value: number) => top + plot - value / ceiling * plot
  let svg = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="chart-title chart-desc"><title id="chart-title">Số lượng Tour ${filters.period === 'month' ? 'theo ngày' : 'theo tháng'}</title><desc id="chart-desc">Trục bắt đầu từ 0. Số liệu chi tiết có trong bảng bên dưới. Dữ liệu minh họa.</desc>`
  for (let i = 0; i <= 4; i++) svg += `<line class="chart-grid" x1="${left}" x2="${width - 8}" y1="${y(i * step)}" y2="${y(i * step)}"/><text class="axis-label" x="${left - 8}" y="${y(i * step) + 3}" text-anchor="end">${i * step}</text>`
  data.forEach((d, index) => {
    const x = left + index * group + group / 2
    if (comparison) svg += `<rect class="bar-previous" x="${x - bar - 2}" y="${y(d.previous.length)}" width="${bar}" height="${d.previous.length / ceiling * plot}" rx="2"><title>${d.label}, ${filters.year - 1}: ${d.previous.length} Tour</title></rect>`
    svg += `<rect class="bar-current" x="${comparison ? x + 2 : x - bar / 2}" y="${y(d.rows.length)}" width="${bar}" height="${d.rows.length / ceiling * plot}" rx="2"><title>${d.label}, ${filters.year}: ${d.rows.length} Tour</title></rect>`
    if (filters.period !== 'month') svg += `<text class="bar-label" x="${comparison ? x + 2 + bar / 2 : x}" y="${y(d.rows.length) - 7}" text-anchor="middle">${isFuture(d.value) ? '—' : d.rows.length}</text>`
    if (filters.period === 'month' && (d.value === 1 || d.value % 5 === 0 || d.value === daysInMonth(filters.year, filters.month))) svg += `<text class="axis-label" x="${x}" y="${height - 6}" text-anchor="middle">${d.value}</text>`
  })
  svg += '</svg>'
  if (filters.period !== 'month') svg += `<div class="chart-actions" style="grid-template-columns:repeat(${data.length},minmax(0,1fr))">${data.map(d => `<button type="button" data-drill="${d.value}" aria-label="Xem tháng ${d.value} năm ${filters.year}">T${d.value}</button>`).join('')}</div>`
  $('trend-chart').innerHTML = svg
  $('trend-title').textContent = filters.period === 'month' ? 'Số Tour theo ngày' : 'Số Tour theo tháng'
  $('chart-help').textContent = filters.period === 'month' ? `Các ngày trong tháng ${filters.month}/${filters.year}.` : 'Chọn nhãn tháng để xem chi tiết.'
  $('current-legend').textContent = String(filters.year)
  $('previous-legend').innerHTML = `<i class="swatch reference"></i>${filters.year - 1}, cùng kỳ`
  $('previous-legend').hidden = !comparison
  const rows = selectTours(filters)
  const peak = data.reduce((best, d) => d.rows.length > best.rows.length ? d : best, data[0])
  $('chart-caption').textContent = rows.length ? `${peak.label}: ${peak.rows.length} Tour, nhiều nhất trong kỳ. ${filters.year === 2026 ? 'Chỉ tính đến 25/11/2026; không coi kỳ tương lai là đã kết thúc.' : 'Số liệu minh họa trọn năm 2025.'}` : 'Không có Tour trong kỳ đã chọn.'
}
function tableCells(summary: ReturnType<typeof summarize>) {
  return `<td>${number(summary.total)}</td><td>${number(summary.completed)}</td><td>${number(summary.cancelled)}</td><td>${number(summary.pending)}</td><td><div class="rate"><span class="rate-track" aria-hidden="true"><i style="width:${summary.rate ?? 0}%"></i></span><span>${percentage(summary.rate)}</span></div></td>`
}
function render() {
  const { year, month, quarter, period, scope } = filters
  $<HTMLSelectElement>('year').value = String(year)
  monthSelect.value = String(month)
  $<HTMLSelectElement>('quarter').value = String(quarter)
  $<HTMLSelectElement>('scope').value = scope
  $('month-field').hidden = period !== 'month'; $('quarter-field').hidden = period !== 'quarter'
  document.querySelectorAll<HTMLButtonElement>('[data-period]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.period === period)))
  const checkbox = $<HTMLInputElement>('compare')
  checkbox.checked = filters.compare && year === 2026; checkbox.disabled = year === 2025
  checkbox.parentElement!.title = year === 2025 ? 'Chưa có dữ liệu mẫu năm 2024 để so sánh.' : ''
  const range = bounds(filters)
  const label = period === 'year' ? `Năm ${year}` : period === 'quarter' ? `Quý ${quarter}/${year}` : `Tháng ${month}/${year}`
  const formatDate = (date: string) => date.split('-').reverse().join('/')
  $('range-label').textContent = `${label}  |  ${range.start > range.end ? "Kỳ chưa bắt đầu" : `${formatDate(range.start)} – ${formatDate(range.end)}`}${scope === 'mine' ? '  |  Tôi vận hành' : ''}`
  $('cutoff').textContent = `Số liệu đến ${year === 2026 ? '25/11/2026' : '31/12/2025'}`
  const rows = selectTours(filters), summary = summarize(rows), previous = summarize(selectTours(filters, year - 1))
  const compare = filters.compare && year === 2026
  const delta = (current: number, old: number) => !compare ? 'Trong kỳ đã chọn' : `${current === old ? 'Không đổi' : `${current > old ? 'Tăng' : 'Giảm'} ${number(Math.abs(current - old))} Tour`} so với cùng kỳ`
  const stats = [
    ['Tổng số Tour', number(summary.total), 'Tour', delta(summary.total, previous.total)],
    ['Đã hoàn thành', number(summary.completed), 'Tour', delta(summary.completed, previous.completed)],
    ['Đã hủy', number(summary.cancelled), 'Tour', delta(summary.cancelled, previous.cancelled)],
    ['Tỷ lệ hoàn thành', percentage(summary.rate), '', `${summary.completed}/${summary.completed + summary.cancelled} Tour đã kết thúc`],
  ]
  $('stats').innerHTML = stats.map(([label, value, unit, hint]) => `<div class="stat"><dt>${label}</dt><dd><strong>${value}</strong><span>${unit}</span></dd><small>${hint}</small></div>`).join('')
  const states = Object.entries(stateLabels) as [State, string][]
  $('distribution').innerHTML = `<div class="distribution-total"><strong>${number(summary.total)}</strong>Tour trong kỳ</div><div class="stack" aria-hidden="true">${states.map(([key]) => { const count = rows.filter(t => t.state === key).length; return count ? `<span class="state-${key.toLowerCase()}" style="flex:${count}"></span>` : '' }).join('')}</div><dl class="distribution-list">${states.map(([key, label]) => { const count = rows.filter(t => t.state === key).length; return `<div><dt><i class="swatch state-${key.toLowerCase()}"></i>${label}</dt><dd>${count}<span>${summary.total ? percentage(count / summary.total * 100) : '—'}</span></dd></div>` }).join('')}</dl>`
  tableRows = buckets(filters)
  renderChart()
  $('period-column').textContent = period === 'month' ? 'Ngày' : 'Tháng'
  $('table-description').textContent = period === 'month' ? 'Đối chiếu số liệu từng ngày trong tháng.' : 'Đối chiếu số liệu từng tháng trong kỳ.'
  $('report-rows').innerHTML = tableRows.map(d => `<tr><td>${period === 'month' ? d.label : `<button type="button" class="table-period" data-drill="${d.value}">${d.label}</button>`}</td>${isFuture(d.value) ? '<td colspan="5">Chưa đến kỳ</td>' : tableCells(summarize(d.rows))}</tr>`).join('')
  $('report-total').innerHTML = `<tr><td>Tổng kỳ</td>${tableCells(summary)}</tr>`
  $('back-year').hidden = period === 'year'
  const state = new URLSearchParams(location.search).get('state') ?? 'full'
  const unavailable = state === 'loading' || state === 'empty' || state === 'error' || !rows.length
  $('report-data').hidden = unavailable
  $('report-state').hidden = !unavailable
  $<HTMLButtonElement>('export').disabled = unavailable
  if (unavailable) {
    $('report-state').innerHTML = state === 'loading' ? '<h3>Đang tải báo cáo…</h3><p>Đang tổng hợp số Tour trong kỳ đã chọn.</p><div class="skeleton" aria-hidden="true"></div><div class="skeleton" aria-hidden="true"></div><a class="button" href="?state=full">Xem dữ liệu mẫu</a>' : state === 'error' ? '<h3>Không tải được báo cáo</h3><p>Chưa có kết quả. Thử tải lại báo cáo.</p><button class="button" type="button" id="retry">Thử lại</button>' : '<h3>Chưa có dữ liệu trong kỳ này</h3><p>Chọn tháng hoặc năm khác để xem báo cáo Tour.</p><button class="button" type="button" id="reset-period">Xem năm 2026</button>'
    $('report-state').setAttribute('aria-busy', String(state === 'loading'))
  }
  $('announcement').textContent = `${label}: ${summary.total} Tour. Dữ liệu minh họa.`
}
document.addEventListener('click', event => {
  const target = (event.target as Element).closest<HTMLButtonElement>('button')
  if (!target) return
  if (target.dataset.period) { filters.period = target.dataset.period as Period; save() }
  if (target.dataset.drill) drill(Number(target.dataset.drill))
  if (target.id === 'back-year') { filters.period = 'year'; save() }
  if (target.id === 'retry' || target.id === 'reset-period') {
    const p = new URLSearchParams(location.search); p.delete('state'); history.replaceState({}, '', `${location.pathname}?${p}`)
    if (target.id === 'reset-period') filters = { ...filters, year: 2026, period: 'year' }
    save()
  }
})
$('filters').addEventListener('submit', event => event.preventDefault())
for (const name of ['year', 'month', 'quarter', 'scope'] as const) $<HTMLSelectElement>(name).addEventListener('change', event => {
  const value = (event.target as HTMLSelectElement).value
  if (name === 'scope') filters.scope = value === 'mine' ? 'mine' : 'all'
  else filters[name] = Number(value)
  save()
})
$<HTMLInputElement>('compare').addEventListener('change', event => { filters.compare = (event.target as HTMLInputElement).checked; save() })
addEventListener('popstate', () => { filters = readFilters(location.search); render() })
$('export').addEventListener('click', () => {
  const quote = (v: unknown) => `"${String(v).replaceAll('"', '""')}"`
  const summary = summarize(selectTours(filters))
  const values = (s: ReturnType<typeof summarize>) => [s.total, s.completed, s.cancelled, s.pending, percentage(s.rate)]
  const lines = [['BẢN DEMO - DỮ LIỆU MINH HỌA'], ['Năm', filters.year, 'Kỳ', filters.period, 'Tháng', filters.month, 'Quý', filters.quarter, 'Phạm vi', filters.scope], ['Kỳ', 'Tổng Tour', 'Hoàn thành', 'Đã hủy', 'Chưa kết thúc', 'Tỷ lệ hoàn thành'], ...tableRows.map(d => [d.label, ...(isFuture(d.value) ? ['Chưa đến kỳ', '', '', '', ''] : values(summarize(d.rows)))]), ['Tổng kỳ', ...values(summary)]]
  const blob = new Blob(['\uFEFF' + lines.map(row => row.map(quote).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob), link = document.createElement('a')
  link.href = url; link.download = `bao-cao-tour-demo-${filters.year}-${filters.period}.csv`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
  $('announcement').textContent = 'Đã xuất CSV dữ liệu mẫu theo bộ lọc đang chọn.'
})
const menu = $('menu-button'), nav = $('navigation')
function closeMenu() { nav.classList.remove('is-open'); menu.setAttribute('aria-expanded', 'false') }
menu.addEventListener('click', () => { const open = nav.classList.toggle('is-open'); menu.setAttribute('aria-expanded', String(open)) })
document.addEventListener('keydown', event => { if (event.key === 'Escape' && nav.classList.contains('is-open')) { closeMenu(); menu.focus() } })
document.addEventListener('click', event => { if (!nav.contains(event.target as Node) && !menu.contains(event.target as Node)) closeMenu() })
document.querySelectorAll<HTMLAnchorElement>('a[href^="/staff/"]').forEach(link => { link.target = '_blank'; link.rel = 'noopener'; link.title = 'Mở ứng dụng hiện tại; cần đăng nhập Staff.' })
render()
