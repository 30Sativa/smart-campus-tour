import { QuestIntercomPanel } from '../../features/quest-stream/QuestIntercomPanel'

export default function QuestAudioPage() {
  return <main className="min-h-screen bg-slate-100 p-6"><div className="mx-auto max-w-2xl space-y-4">
    <h1 className="text-2xl font-semibold text-slate-900">Quest trên robot · Đàm thoại</h1>
    <QuestIntercomPanel side="quest" />
    <p className="text-sm text-slate-600">Mở trình duyệt có thể thay đổi hình ảnh mirror đang phát. Kiểm tra lại preview camera sau khi kết nối.</p>
  </div></main>
}
