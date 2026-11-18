import React from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Routes, Route } from 'react-router'
import Page from '/src/routes/staff/manage/StaffManageTourCreatePage'
import { useAuthStore } from '/src/stores/auth-store'
import '/src/index.css'
const mode = new URLSearchParams(location.search).get('kind')
const selected = mode === 'choose' ? '' : '?kind=' + (mode || 'normal') + '&route=revision-2&date=2026-11-24&shift=S1'
const route = { routeId:'route-2',revisionId:'revision-2',revisionNumber:3,name:'Tuyến thử (dữ liệu mẫu)',mapKey:'library-v1',isSubmitted:true,verificationStatus:'PASS',stops:[{poiRevisionId:'poi-rev-1',sourcePoiVerificationRecordId:'verification-1',stopOrder:1,dwellSeconds:30,headSteps:[],name:'Thư viện',x:0,y:0,yaw:0,cameraPreset:'FRONT'}] }
const slot = {time:'08:15',startsAt:'2026-11-24T01:15:00Z',available:true,reasonCode:null,reason:null,reservationStartsAt:'2026-11-24T01:00:00Z',reservationEndsAt:'2026-11-24T03:00:00Z',registrationClosesAt:'2026-11-22T01:15:00Z',shiftCode:'S1',shiftName:'Ca sáng',maxDurationSeconds:5400}
useAuthStore.getState().setAuth('layout-fixture',{userId:'staff-1',username:'lan',role:'Staff'})
window.fetch = async(input,init) => {
 const path = new URL(String(input),location.origin).pathname
 if(init?.method && init.method !== 'GET') return new Response(JSON.stringify({success:false,message:'Đây là dữ liệu kiểm tra bố cục, không gửi thay đổi.'}),{status:400,headers:{'Content-Type':'application/json'}})
 let data:unknown=[]
 if(path==='/api/routes') return new Response(JSON.stringify({data:[route],pagination:{page:1,pageSize:100,totalItems:1,totalPages:1}}),{headers:{'Content-Type':'application/json'}})
 if(path==='/api/routes/route-2/revisions')data=route
 if(path==='/api/staff/manage/tours/operators')data=[{userId:'staff-1',fullName:'Lan Staff (mẫu)',username:'lan'}]
 if(path==='/api/staff/manage/tours/robots')data=[{robotCode:'amr-01',displayName:'AMR 01 (mẫu)',usable:true,blockReason:null,quick:{expectedDurationSeconds:1260,startBy:'2026-11-24T01:30:00Z',holdStartsAt:'2026-11-24T01:00:00Z',holdEndsAt:'2026-11-24T02:06:00Z',autoCancelAt:'2026-11-24T02:06:00Z'}}]
 if(path==='/api/staff/manage/tours/shifts')data={days:[],recommendedMaxSeconds:3600,quickTourWaitMinutes:30}
 if(path==='/api/staff/manage/tours/slots')data={routeRevisionId:'revision-2',robotCode:'amr-01',expectedDurationSeconds:1320,recommendedMaxSeconds:3600,days:[{date:'2026-11-24',slots:[slot,{...slot,shiftCode:'S2',shiftName:'Ca chiều 1',time:'13:15',startsAt:'2026-11-24T06:15:00Z',reservationStartsAt:'2026-11-24T06:00:00Z',reservationEndsAt:'2026-11-24T08:00:00Z'}]}]}
 return new Response(JSON.stringify({success:true,data}),{headers:{'Content-Type':'application/json'}})
}
createRoot(document.getElementById('root')!).render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><MemoryRouter initialEntries={['/staff/manage/tours/new'+selected]}><Routes><Route path="/staff/manage/tours/new" element={<Page/>}/></Routes></MemoryRouter></QueryClientProvider>)
if(mode!=='choose'){
 let filled=false
 const observer=new MutationObserver(()=>{const name=document.querySelector('input[maxlength="150"]') as HTMLInputElement;const robot=document.querySelector('select[aria-label="Robot"]') as HTMLSelectElement
 if(filled||!name||!robot||robot.options.length<2)return
 filled=true
 Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(name,'Tour trình diễn (dữ liệu mẫu)');name.dispatchEvent(new Event('input',{bubbles:true}))
 Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value')!.set!.call(robot,'amr-01');robot.dispatchEvent(new Event('change',{bubbles:true}));observer.disconnect()
 })
 observer.observe(document.getElementById('root')!,{childList:true,subtree:true})
}
