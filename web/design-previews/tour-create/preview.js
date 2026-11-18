const paths = {
 grid:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
 calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18M8 15h2"/>',
 clipboard:'<rect x="5" y="4" width="14" height="17" rx="2"/><rect x="9" y="2" width="6" height="4" rx="1"/><path d="M9 12h6M9 16h4"/>',
 route:'<circle cx="6" cy="6" r="3"/><circle cx="18" cy="18" r="3"/><path d="M9 6h8a4 4 0 0 1 0 8H7a3 3 0 0 0 0 6h8"/>',
 play:'<rect x="2" y="3" width="20" height="14" rx="2"/><path d="m10 7 5 3-5 3zM8 21h8M12 17v4"/>',
 box:'<path d="m12 3 9 5v8l-9 5-9-5V8zM3 8l9 5 9-5M12 13v8M7.5 5.5l9 5"/>',
 bot:'<rect x="4" y="7" width="16" height="13" rx="3"/><path d="M12 3v4M1 12v4M23 12v4M8 15h.01M16 15h.01M9 18h6"/>',
 pin:'<path d="M20 10c0 6-8 11-8 11S4 16 4 10a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
 clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
 image:'<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/>',
 check:'<path d="m5 12 4 4L19 6"/>', zap:'<path d="m13 2-9 12h7l-1 8 10-12h-7z"/>',
 back:'<path d="m12 5-7 7 7 7M5 12h15"/>', chevron:'<path d="m9 5 7 7-7 7"/>', user:'<circle cx="12" cy="8" r="3"/><path d="M5 21v-2a7 7 0 0 1 14 0v2"/>'
};
document.querySelectorAll('[data-icon]').forEach(el=>el.insertAdjacentHTML('afterbegin',`<svg viewBox="0 0 24 24" aria-hidden="true">${paths[el.dataset.icon]||''}</svg>`));
const $=id=>document.getElementById(id), value=id=>$(id).value.trim();
let kind='normal', shift='', coverUrl=null;
const shifts={S1:['Ca sáng','08:00 đến 10:00','08:15'],S4:['Ca trưa','11:00 đến 12:00','11:15'],S2:['Ca chiều 1','13:00 đến 15:00','13:15'],S3:['Ca chiều 2','16:00 đến 18:00','16:15'],S5:['Ca tối','19:00 đến 21:00','19:15']};
function update(){
 const quick=kind==='quick', route=Boolean(value('route'));
 $('robot').disabled=!route; if(!route)$('robot').value='';
 $('robot-hint').textContent=route?'Robot phù hợp với tuyến đã chọn.':'Chọn tuyến trước.';
 const scheduled=route&&value('robot')&&value('date');
 $('shifts').hidden=!scheduled; $('available-hint').hidden=!scheduled; $('shift-empty').hidden=Boolean(scheduled); if(!scheduled)shift='';
 document.querySelectorAll('[data-shift]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.shift===shift)));
 const text={'review-name':value('tour-name')||'Tour chưa đặt tên','review-kind':quick?'Tour nhanh':'Tour theo ca','review-route':route?'Tuyến thử (mẫu)':'Chưa chọn','review-robot':value('robot')?'Robot mẫu':'Chưa chọn','review-operator':value('operator')?'Minh Staff (mẫu)':'Chưa chọn','review-date':value('date')?value('date').split('-').reverse().join('/'):'Chưa chọn','review-shift':shifts[shift]?.[0]||'Chưa chọn','review-capacity':`${value('capacity')||'0'} chỗ`,'review-hold':quick?'Từ lúc bấm Tạo Tour':shifts[shift]?.[1]||'Chờ chọn ca'};
 Object.entries(text).forEach(([id,t])=>$(id).textContent=t);
 const closing=!quick&&value('date')&&shift?new Date(`${value('date')}T00:00:00+07:00`):null;
 if(closing)closing.setTime(closing.getTime()-48*3600000);
 $('review-close').textContent=quick?'Khi chốt Tour hoặc tới hạn bắt đầu':closing?`${closing.toLocaleDateString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'})}, ${shifts[shift][2]}`:'Chờ chọn ca';
 $('route-full').hidden=!route; $('route-empty').hidden=route;
 const missing=[!value('tour-name')&&'nhập tên Tour',quick&&!value('quick-reason')&&'nhập lý do tạo gấp',!route&&'chọn tuyến',!value('robot')&&'chọn robot',!value('operator')&&'chọn người vận hành',!quick&&!value('date')&&'chọn ngày',!quick&&!shift&&'chọn ca',!$('capacity').checkValidity()&&'sức chứa từ 1 đến 20 chỗ',!quick&&value('date')&&!$('date').checkValidity()&&'chọn ngày hợp lệ'].filter(Boolean);
 $('capacity').setAttribute('aria-invalid',String(!$('capacity').checkValidity())); $('create').disabled=missing.length>0;
 $('missing').textContent=missing.length?`Cần ${missing.join(', ')}.`:'Đã đủ thông tin để thử bản mẫu.';
}
function setKind(next){
 kind=next; const quick=kind==='quick';
 document.querySelectorAll('[data-kind]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.kind===kind)));
 $('reason-field').hidden=!quick; $('quick-reason').required=quick; $('normal-schedule').hidden=quick; $('date').required=!quick; $('date').disabled=quick;
 $('quick-notice').hidden=!quick; $('quick-deadline-row').hidden=!quick; $('review-date-row').hidden=quick; $('review-shift-row').hidden=quick;
 $('kind-help').textContent=quick?'Không chọn ngày, ca. Cần ghi lý do; robot được giữ ngay khi tạo.':'Tạo trước ít nhất 72 giờ. Đăng ký đóng trước 48 giờ; Staff duyệt trước 24 giờ.';
 $('page-description').textContent=quick?'Tour nhanh giữ robot ngay từ lúc tạo. Staff duyệt, chốt Tour rồi bắt đầu khi robot sẵn sàng.':'Tour mới nhận đăng ký và giữ chỗ robot. Staff bắt đầu thủ công khi tới giờ.';
 $('review-note').textContent=quick?'Không cần đăng ký đã duyệt để bắt đầu. Robot phải đạt mọi điều kiện. Chưa bắt đầu thì tự hủy khi hết khung giữ robot.':'Sau khi tạo, Tour ở trạng thái Đang nhận đăng ký. Đại diện trường có thể đăng ký đoàn.';
 update();
}
function clearCover(){if(coverUrl)URL.revokeObjectURL(coverUrl);coverUrl=null;$('cover').value='';$('cover-preview').innerHTML=`<svg viewBox="0 0 24 24" aria-hidden="true">${paths.image}</svg>`;$('clear-cover').hidden=true;$('cover-status').textContent='JPG, PNG, WebP hoặc AVIF, tối đa 10 MB.';}
function reset(){$('tour-form').reset();shift='';clearCover();$('feedback').textContent='';setKind('normal');}
function sample(){$('tour-name').value='Tour trình diễn (dữ liệu mẫu)';$('route').value='sample';update();$('robot').value='sample';$('operator').value='sample';$('date').value='2026-11-24';$('quick-reason').value='Buổi trình diễn với đoàn khách của nhà trường.';shift='S1';update();}
document.querySelectorAll('[data-kind]').forEach(b=>b.addEventListener('click',()=>setKind(b.dataset.kind)));
document.querySelectorAll('[data-shift]').forEach(b=>b.addEventListener('click',()=>{shift=b.dataset.shift;update();}));
$('tour-form').addEventListener('input',update);
$('route').addEventListener('change',()=>{$('robot').value='';shift='';update();});
$('date').addEventListener('change',()=>{shift='';update();});
$('tour-form').addEventListener('change',update);
$('tour-form').addEventListener('submit',e=>{e.preventDefault();$('feedback').textContent='Đây là bản xem trước. Thông tin chưa được gửi và chưa tạo Tour.';});
$('cancel').addEventListener('click',reset);$('sample-toggle').addEventListener('click',sample);$('clear-cover').addEventListener('click',clearCover);
$('cover').addEventListener('change',()=>{
 const file=$('cover').files[0];if(!file)return;
 if(!['image/jpeg','image/png','image/webp','image/avif'].includes(file.type)||file.size>10*1024*1024){$('cover-status').textContent='Chọn JPG, PNG, WebP hoặc AVIF, tối đa 10 MB.';$('cover').value='';return;}
 if(coverUrl)URL.revokeObjectURL(coverUrl);coverUrl=URL.createObjectURL(file);
 const img=document.createElement('img');img.src=coverUrl;img.alt='Xem trước ảnh Tour đã chọn';$('cover-preview').replaceChildren(img);$('clear-cover').hidden=false;$('cover-status').textContent=`Đã chọn ${file.name}. Bản xem trước chưa tải ảnh lên.`;
});
$('video').addEventListener('change',()=>{$('video-status').textContent=$('video').files[0]?`Đã chọn ${$('video').files[0].name}. Bản xem trước chưa tải video lên.`:'Bản xem trước chỉ chọn tệp, chưa tải video lên.';});
function state(next){$('route-loading').hidden=next!=='loading';$('route-error').hidden=next!=='error';$('route-field').hidden=next==='loading'||next==='error';if(next==='full')sample();else{$('route').value='';update();}}
document.querySelectorAll('[data-state]').forEach(b=>b.addEventListener('click',()=>state(b.dataset.state)));
$('retry').addEventListener('click',()=>state('empty'));
document.querySelectorAll('a').forEach(link=>link.addEventListener('click',e=>{e.preventDefault();$('feedback').textContent='Điều hướng được giữ để tham chiếu. Bản xem trước chỉ mô phỏng trang Tạo Tour.';}));
const params=new URLSearchParams(location.search);setKind(params.get('kind')==='quick'?'quick':'normal');if(params.has('sample'))sample();

$('choose-cover').addEventListener('click',()=>$('cover').click());
$('choose-video').addEventListener('click',()=>$('video').click());
