import { Check, Copy, Mail } from 'lucide-react'
import type { RepresentativeRegistrationDetail } from '../../../api/contracts/representative'
import { buttonClass } from '../../staff/ui-classes'
import { panelBase } from '../rep-classes'
import { formatDateTime, studentMessage } from '../rep-format'
import { useCopy } from '../use-copy'

/**
 * Participation details of an approved group (scope §3.4): the join link and
 * the group code the representative shares with the students. Never the
 * roster: each student types their own name and class.
 */
export function InvitationPanel({ registration: r, onCopied }: { registration: RepresentativeRegistrationDetail; onCopied: (what: string) => void }) {
  const p = r.participation
  const { copied, copy } = useCopy()
  if (!p) return null
  const message = studentMessage({ tourName: r.tourName, scheduledAt: r.tourScheduledAt, joinLink: p.joinLink, groupCode: p.groupCode, schoolName: r.schoolName })
  const doCopy = (key: string, text: string, what: string) => void copy(key, text).then(() => onCopied(what))

  return (
    <section className={`${panelBase} overflow-hidden`} aria-labelledby="invite-title">
      <div className="border-b border-[#eef1f5] bg-[#f5f9ff] px-5 py-4 sm:px-6">
        <h2 id="invite-title" className="text-base font-semibold text-[#0f172a]">Thông tin tham gia</h2>
        <p className="mt-1 text-sm leading-relaxed text-[#475569]">Chia sẻ đường dẫn và mã đoàn cho học sinh trong danh sách đã duyệt. Không cần gửi danh sách học sinh: mỗi em tự nhập họ tên và lớp.</p>
      </div>

      <div className="grid gap-4 px-5 py-5 sm:px-6 md:grid-cols-[minmax(0,1fr)_minmax(0,220px)]">
        <div className="min-w-0 rounded-xl border border-[#e5e9f0] p-4">
          <p className="text-[13px] text-[#64748b]">Đường dẫn cho học sinh</p>
          <p className="mt-1.5 font-mono text-sm break-all text-[#0f172a]">{p.joinLink}</p>
          <button type="button" onClick={() => doCopy('link', p.joinLink, 'đường dẫn')} className={`${buttonClass('secondary', 'sm')} mt-3`}>
            {copied === 'link' ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}{copied === 'link' ? 'Đã sao chép' : 'Sao chép link'}
          </button>
        </div>
        <div className="rounded-xl border border-[#e5e9f0] p-4">
          <p className="text-[13px] text-[#64748b]">Mã đoàn</p>
          <p className="mt-1 font-mono text-2xl font-bold tracking-[0.08em] text-[#0f172a]">{p.groupCode}</p>
          <button type="button" onClick={() => doCopy('code', p.groupCode, 'mã đoàn')} className={`${buttonClass('secondary', 'sm')} mt-3`}>
            {copied === 'code' ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}{copied === 'code' ? 'Đã sao chép' : 'Sao chép mã đoàn'}
          </button>
        </div>
      </div>

      <div className="px-5 pb-5 sm:px-6">
        <h3 className="text-sm font-semibold text-[#0f172a]">Hướng dẫn học sinh</h3>
        <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-sm leading-relaxed text-[#475569] marker:text-[#94a3b8]">
          {p.instructions.map((line) => <li key={line}>{line}</li>)}
        </ol>
        <div className="mt-5 flex flex-col gap-3 border-t border-[#eef1f5] pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-start gap-2 text-[13px] leading-snug text-[#64748b]">
            <Mail size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
            {p.emailSentAt ? `Admin đã gửi email tới ${r.contactEmail} lúc ${formatDateTime(p.emailSentAt)}.` : 'Admin chưa gửi email. Bạn vẫn sao chép được thông tin tại đây.'}
          </p>
          <button type="button" onClick={() => doCopy('message', message, 'lời nhắn cho học sinh')} className={`${buttonClass('ghost', 'sm')} shrink-0`}>
            {copied === 'message' ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}{copied === 'message' ? 'Đã sao chép lời nhắn' : 'Sao chép lời nhắn cho học sinh'}
          </button>
        </div>
      </div>
    </section>
  )
}
