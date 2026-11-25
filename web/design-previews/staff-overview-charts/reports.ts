import { buckets, CUTOFF, dayKey, daysInMonth, readFilters, selectTours, summarize, type Filters } from './report-data.ts'

const root = document.getElementById('report-addition')
if (root) {
  const element = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T
  const percent = (value: number | null) => value === null ? '—' : `${value.toLocaleString('vi-VN', { maximumFractionDigits: 1 })}%`
  const current = (): Filters => {
    const p = new URLSearchParams(location.search)
    return { ...readFilters(`?year=${p.get('reportYear') ?? 2026}&month=${p.get('reportMonth') ?? 11}`), period: p.get('reportPeriod') === 'month' ? 'month' : 'year', scope: p.get('mine') === '1' ? 'mine' : 'all', compare: false }
  }
  function update(patch: { reportYear?: string; reportMonth?: string; reportPeriod?: string }) {
    const next = new URL(location.href)
    for (const [key, value] of Object.entries(patch)) next.searchParams.set(key, value)
    history.pushState(null, '', next); render()
  }
  const month = element<HTMLSelectElement>('report-month')
  month.innerHTML = Array.from({ length: 12 }, (_, i) => `<option value="${i + 1}">Tháng ${i + 1}</option>`).join('')
  function render() {
    const f = current(), rows = selectTours(f), summary = summarize(rows), series = buckets(f)
    element<HTMLSelectElement>('report-year').value = String(f.year); month.value = String(f.month)
    element('report-month-field').hidden = f.period !== 'month'
    root!.querySelectorAll<HTMLButtonElement>('[data-report-period]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.reportPeriod === f.period)))
    const label = f.period === 'year' ? `Năm ${f.year}` : `Tháng ${f.month}/${f.year}`
    element('report-range').textContent = `${label}${f.scope === 'mine' ? ', Tour tôi vận hành' : ', tất cả Tour'}`
    element('report-trend-title').textContent = f.period === 'year' ? 'Số Tour theo tháng' : 'Số Tour theo ngày'
    const w = 640, h = 210, left = 36, top = 24, floor = 175, plot = floor - top
    const step = Math.max(1, Math.ceil(Math.max(1, ...series.map(d => d.rows.length)) / 4)), max = step * 4
    const group = (w - left - 12) / series.length, bar = Math.min(24, group * .48)
    const y = (n: number) => floor - n / max * plot
    let svg = `<svg viewBox="0 0 ${w} ${h}" role="img" aria-labelledby="report-svg-title report-svg-description"><title id="report-svg-title">${label}: ${summary.total} Tour, dữ liệu minh họa</title><desc id="report-svg-description">Trục bắt đầu từ 0. ${series.map(d => `${d.label}: ${d.rows.length} Tour`).join('; ')}. Kỳ sau 13/11/2026 chưa có số liệu.</desc>`
    for (let i = 0; i <= 4; i++) svg += `<line class="report-grid" x1="${left}" x2="${w - 12}" y1="${y(i * step)}" y2="${y(i * step)}"/><text class="report-axis" x="${left - 12}" y="${y(i * step) + 4}" text-anchor="end">${i * step}</text>`
    series.forEach((d, index) => {
      const future = dayKey(f.year, f.period === 'month' ? f.month : d.value, f.period === 'month' ? d.value : 1) > CUTOFF
      const x = left + (index + .5) * group
      svg += `<rect class="report-mark" x="${x - bar / 2}" y="${y(d.rows.length)}" width="${bar}" height="${d.rows.length / max * plot}" rx="2"><title>${d.label}: ${future ? 'Chưa đến kỳ' : `${d.rows.length} Tour`}</title></rect>`
      if (f.period === 'year' || d.rows.length) svg += `<text class="report-value" x="${x}" y="${y(d.rows.length) - 8}" text-anchor="middle">${future ? '—' : d.rows.length}</text>`
      if (f.period === 'month' && (d.value === 1 || d.value % 5 === 0 || d.value === daysInMonth(f.year, f.month))) svg += `<text class="report-axis" x="${x}" y="201" text-anchor="middle">${d.value}</text>`
    })
    svg += '</svg>'
    if (f.period === 'year') svg += `<div class="report-months">${series.map(d => `<button type="button" data-report-month="${d.value}" aria-label="Xem tháng ${d.value}/${f.year}">T${d.value}</button>`).join('')}</div>`
    element('report-chart').innerHTML = svg
    element('report-caption').textContent = `${summary.total} Tour trong kỳ. ${f.period === 'year' ? 'Chọn nhãn tháng để xem theo ngày.' : 'Các ngày sau mốc chốt dữ liệu chưa được tính.'}`
    element('report-outcomes').innerHTML = `<div class="report-total"><strong>${summary.total}</strong>Tour trong kỳ</div><div class="report-stack" aria-hidden="true">${[['completed', summary.completed], ['cancelled', summary.cancelled], ['pending', summary.pending]].map(([key, value]) => value ? `<span class="report-${key}" style="flex:${value}"></span>` : '').join('')}</div><dl class="report-state-list">${[['completed', 'Đã hoàn thành', summary.completed], ['cancelled', 'Đã hủy', summary.cancelled], ['pending', 'Chưa kết thúc', summary.pending]].map(([key, label, value]) => `<div><dt><i class="report-${key}" aria-hidden="true"></i>${label}</dt><dd>${value} Tour</dd></div>`).join('')}</dl><p class="report-rate">Tỷ lệ hoàn thành: <strong>${percent(summary.rate)}</strong><small>${summary.completed}/${summary.completed + summary.cancelled} Tour đã kết thúc; không tính Tour đang chạy hoặc chờ mở.</small></p>`
    element('report-message').textContent = rows.length ? `${label}: ${summary.total} Tour, ${summary.completed} hoàn thành, ${summary.cancelled} đã hủy. Dữ liệu minh họa.` : 'Chưa có số liệu trong kỳ này. Chọn một tháng hoặc năm khác.'
  }
  root.addEventListener('click', event => {
    const button = (event.target as Element).closest<HTMLButtonElement>('button')
    if (button?.dataset.reportPeriod) update({ reportPeriod: button.dataset.reportPeriod })
    if (button?.dataset.reportMonth) update({ reportPeriod: 'month', reportMonth: button.dataset.reportMonth })
  })
  element('report-year').addEventListener('change', event => update({ reportYear: (event.target as HTMLSelectElement).value }))
  month.addEventListener('change', event => update({ reportMonth: (event.target as HTMLSelectElement).value }))
  document.querySelectorAll('[data-scope]').forEach(button => button.addEventListener('click', () => queueMicrotask(render)))
  addEventListener('popstate', render)
  render()
}
