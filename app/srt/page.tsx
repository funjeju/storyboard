'use client'

import { useState, useRef } from 'react'
import Link from 'next/link'
import { ref as storageRef, uploadBytes } from 'firebase/storage'
import { storage } from '@/lib/firebase'
import { useAuth } from '@/providers/AuthProvider'
import ImageSegmentPanel from '@/components/srt/ImageSegmentPanel'

function WaveIcon() {
  return (
    <svg width="40" height="20" viewBox="0 0 40 20" fill="none" className="opacity-60">
      {[2, 6, 10, 14, 18, 22, 26, 30, 34, 38].map((x, i) => (
        <rect
          key={i}
          x={x} y={10 - [4,8,12,10,6,14,8,12,6,10][i] / 2}
          width="2" height={[4,8,12,10,6,14,8,12,6,10][i]}
          rx="1" fill="#3B82F6"
          style={{ opacity: 0.4 + i * 0.06 }}
        />
      ))}
    </svg>
  )
}

const MAX_MP3_SIZE = 25 * 1024 * 1024 // 25MB — OpenAI Whisper API 한도

export default function SrtPage() {
  const { user, loading: authLoading, openAuthModal } = useAuth()

  const [mp3File, setMp3File]   = useState<File | null>(null)
  const [txtFile, setTxtFile]   = useState<File | null>(null)
  const [status, setStatus]     = useState<'idle' | 'uploading' | 'loading' | 'done' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [srtContent, setSrtContent] = useState('')
  const [sessionId, setSessionId] = useState('')
  const [lyricSnapshot, setLyricSnapshot] = useState('')
  const [mp3Drag, setMp3Drag]   = useState(false)
  const [txtDrag, setTxtDrag]   = useState(false)
  const mp3Ref = useRef<HTMLInputElement>(null)
  const txtRef = useRef<HTMLInputElement>(null)

  const pickMp3 = (file: File | null) => {
    if (!file) { setMp3File(null); return }
    if (file.size > MAX_MP3_SIZE) {
      setErrorMsg(`MP3 파일이 너무 큽니다 (${(file.size / 1024 / 1024).toFixed(1)}MB). 25MB 이하 파일만 사용 가능합니다.`)
      setStatus('error')
      setMp3File(null)
      return
    }
    setErrorMsg('')
    setStatus('idle')
    setMp3File(file)
  }

  const handleGenerate = async () => {
    if (!mp3File) return
    if (!user) { openAuthModal('login'); return }

    setStatus('uploading')
    setErrorMsg('')
    setSrtContent('')

    try {
      // 1. Storage에 임시 업로드 (Vercel body 한도 우회)
      const ext = mp3File.name.split('.').pop() || 'mp3'
      const fileId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`
      const mp3Path = `srt_temp/${user.uid}/${fileId}`
      await uploadBytes(storageRef(storage, mp3Path), mp3File, { contentType: mp3File.type || 'audio/mpeg' })

      // 2. TXT 내용 읽기 (옵션) — 이미지 모드에서 재사용하기 위해 보관
      let txtContent = ''
      if (txtFile) txtContent = await txtFile.text()
      setLyricSnapshot(txtContent)

      // 3. API 호출 (경로 + 토큰)
      setStatus('loading')
      const token = await user.getIdToken()
      const res = await fetch('/api/srt-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          mp3Path,
          mp3MimeType: mp3File.type || 'audio/mpeg',
          mp3Name: mp3File.name,
          txtContent,
        }),
      })
      if (!res.ok) {
        const contentType = res.headers.get('content-type') || ''
        const errMsg = contentType.includes('application/json')
          ? (await res.json()).error
          : await res.text()
        throw new Error(errMsg || '오류가 발생했습니다.')
      }
      const text = await res.text()
      setSrtContent(text)
      // 이미지 생성 세션 ID 부여 (storage 경로 segregation)
      setSessionId(`s${Date.now()}${Math.random().toString(36).slice(2, 8)}`)
      setStatus('done')
      downloadSrt(text)
    } catch (e: any) {
      setErrorMsg(e.message)
      setStatus('error')
    }
  }

  const downloadSrt = (content: string) => {
    const blob = new Blob([content], { type: 'text/plain; charset=utf-8' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = (mp3File?.name.replace(/\.[^.]+$/, '') || 'subtitles') + '.srt'
    a.click()
    URL.revokeObjectURL(url)
  }

  const onDrop = (e: React.DragEvent, type: 'mp3' | 'txt') => {
    e.preventDefault()
    if (type === 'mp3') { setMp3Drag(false); pickMp3(e.dataTransfer.files[0] || null) }
    else                { setTxtDrag(false); setTxtFile(e.dataTransfer.files[0] || null) }
  }

  const segmentCount = srtContent ? srtContent.split('\n\n').filter(Boolean).length : 0

  return (
    <div className="min-h-screen bg-[#F5F7FA] flex flex-col">
      {/* 헤더 */}
      <header className="bg-white border-b border-gray-100 px-6 py-4 flex items-center gap-3">
        <Link href="/" className="text-gray-400 hover:text-gray-600 text-sm transition-colors">← 홈</Link>
        <div className="w-px h-4 bg-gray-200" />
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-blue-500 flex items-center justify-center">
            <span className="text-white text-[10px] font-black tracking-tight">SRT</span>
          </div>
          <span className="font-bold text-gray-900 text-sm">SRT Generator</span>
        </div>
      </header>

      {/* 메인 */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 py-12">
        {/* 타이틀 */}
        <div className="text-center mb-10">
          <div className="flex items-center justify-center gap-3 mb-4">
            <WaveIcon />
            <h1 className="text-2xl font-black text-gray-900 tracking-tight">자막 자동 생성</h1>
            <WaveIcon />
          </div>
          <p className="text-gray-500 text-sm max-w-sm mx-auto leading-relaxed">
            MP3 파일만으로 SRT 자막을 생성하거나,<br />
            스크립트 TXT를 함께 올리면 정확도가 높아져요
          </p>
        </div>

        {/* 카드 */}
        <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="p-6 space-y-5">

            {/* MP3 업로드 */}
            <div>
              <div className="flex items-center gap-2 mb-2.5">
                <span className="w-5 h-5 rounded-full bg-blue-500 text-white text-[10px] flex items-center justify-center font-bold shrink-0">1</span>
                <span className="text-sm font-semibold text-gray-800">MP3 오디오 파일</span>
                <span className="ml-auto text-[10px] font-semibold text-blue-500 bg-blue-50 px-2 py-0.5 rounded-full">필수</span>
              </div>
              <div
                onClick={() => mp3Ref.current?.click()}
                onDrop={e => onDrop(e, 'mp3')}
                onDragOver={e => { e.preventDefault(); setMp3Drag(true) }}
                onDragLeave={() => setMp3Drag(false)}
                className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all select-none ${
                  mp3Drag   ? 'border-blue-400 bg-blue-50 scale-[1.01]'
                  : mp3File ? 'border-blue-300 bg-blue-50'
                  : 'border-gray-200 hover:border-blue-300 hover:bg-gray-50'
                }`}
              >
                {mp3File ? (
                  <div className="flex items-center justify-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-blue-100 flex items-center justify-center shrink-0">
                      <span className="text-lg">🎵</span>
                    </div>
                    <div className="text-left min-w-0">
                      <p className="text-sm font-semibold text-blue-700 truncate max-w-[200px]">{mp3File.name}</p>
                      <p className="text-xs text-blue-400">{(mp3File.size / 1024 / 1024).toFixed(1)} MB</p>
                    </div>
                    <button
                      onClick={e => { e.stopPropagation(); setMp3File(null) }}
                      className="ml-auto text-blue-300 hover:text-blue-500 text-lg leading-none"
                    >×</button>
                  </div>
                ) : (
                  <>
                    <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center mx-auto mb-2">
                      <span className="text-xl">🎵</span>
                    </div>
                    <p className="text-sm text-gray-600 font-medium">클릭하거나 드래그</p>
                    <p className="text-xs text-gray-400 mt-1">MP3, WAV, M4A · 최대 25MB</p>
                  </>
                )}
              </div>
              <input ref={mp3Ref} type="file" accept="audio/*" className="hidden"
                onChange={e => pickMp3(e.target.files?.[0] || null)} />
            </div>

            {/* 구분선 */}
            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-gray-100" />
              <span className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider">선택 — 정확도 향상</span>
              <div className="flex-1 h-px bg-gray-100" />
            </div>

            {/* TXT 업로드 */}
            <div>
              <div className="flex items-center gap-2 mb-2.5">
                <span className={`w-5 h-5 rounded-full text-white text-[10px] flex items-center justify-center font-bold shrink-0 ${txtFile ? 'bg-emerald-500' : 'bg-gray-300'}`}>2</span>
                <span className="text-sm font-semibold text-gray-800">스크립트 TXT 파일</span>
                <span className="ml-auto text-[10px] font-semibold text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">선택</span>
              </div>
              <div
                onClick={() => txtRef.current?.click()}
                onDrop={e => onDrop(e, 'txt')}
                onDragOver={e => { e.preventDefault(); setTxtDrag(true) }}
                onDragLeave={() => setTxtDrag(false)}
                className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-all select-none ${
                  txtDrag   ? 'border-emerald-400 bg-emerald-50 scale-[1.01]'
                  : txtFile ? 'border-emerald-300 bg-emerald-50'
                  : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                }`}
              >
                {txtFile ? (
                  <div className="flex items-center justify-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-emerald-100 flex items-center justify-center shrink-0">
                      <span className="text-lg">📄</span>
                    </div>
                    <div className="text-left min-w-0">
                      <p className="text-sm font-semibold text-emerald-700 truncate max-w-[200px]">{txtFile.name}</p>
                      <p className="text-xs text-emerald-400">{(txtFile.size / 1024).toFixed(0)} KB</p>
                    </div>
                    <button
                      onClick={e => { e.stopPropagation(); setTxtFile(null) }}
                      className="ml-auto text-emerald-300 hover:text-emerald-500 text-lg leading-none"
                    >×</button>
                  </div>
                ) : (
                  <>
                    <span className="text-xl block mb-1">📄</span>
                    <p className="text-sm text-gray-400">스크립트 TXT 파일 드래그 또는 클릭</p>
                  </>
                )}
              </div>
              <input ref={txtRef} type="file" accept=".txt,text/plain" className="hidden"
                onChange={e => setTxtFile(e.target.files?.[0] || null)} />
            </div>

            {/* 모드 표시 */}
            {mp3File && (
              <div className={`rounded-xl px-4 py-3 flex items-center gap-2.5 text-sm ${
                txtFile
                  ? 'bg-emerald-50 border border-emerald-100'
                  : 'bg-blue-50 border border-blue-100'
              }`}>
                <span className="text-base">{txtFile ? '✨' : '🎙️'}</span>
                <div>
                  <p className={`font-semibold text-xs ${txtFile ? 'text-emerald-700' : 'text-blue-600'}`}>
                    {txtFile ? '고정확도 모드' : '표준 모드'}
                  </p>
                  <p className={`text-xs mt-0.5 ${txtFile ? 'text-emerald-500' : 'text-blue-400'}`}>
                    {txtFile
                      ? 'MP3 타이밍 + 스크립트 텍스트를 정렬합니다'
                      : 'TXT 스크립트를 추가하면 정확도가 올라가요'}
                  </p>
                </div>
              </div>
            )}

            {/* 에러 */}
            {status === 'error' && (
              <div className="bg-red-50 border border-red-100 text-red-600 rounded-xl px-4 py-3 text-sm flex items-center gap-2">
                <span>⚠️</span>{errorMsg}
              </div>
            )}

            {/* 비로그인 안내 */}
            {!authLoading && !user && (
              <div className="bg-amber-50 border border-amber-100 text-amber-700 rounded-xl px-4 py-3 text-xs flex items-center gap-2">
                <span>🔒</span>SRT 자막 생성은 로그인 후 이용 가능합니다.
              </div>
            )}

            {/* 생성 버튼 */}
            <button
              onClick={handleGenerate}
              disabled={!mp3File || status === 'uploading' || status === 'loading' || authLoading}
              className={`w-full py-4 rounded-xl font-bold text-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 ${
                status === 'done'
                  ? 'bg-emerald-500 hover:bg-emerald-600 text-white'
                  : 'bg-blue-500 hover:bg-blue-600 text-white shadow-sm shadow-blue-200'
              }`}
            >
              {status === 'uploading' ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  파일 업로드 중...
                </>
              ) : status === 'loading' ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  자막 생성 중... (1~2분 소요)
                </>
              ) : status === 'done' ? (
                '✅ 완료 — 다시 생성하기'
              ) : !user && !authLoading ? (
                '로그인하고 시작하기'
              ) : (
                'SRT 자막 파일 생성 →'
              )}
            </button>
          </div>

          {/* 완료 — 미리보기 */}
          {status === 'done' && srtContent && (
            <div className="border-t border-gray-100 bg-gray-50 p-6">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-xs font-bold text-gray-700">생성 완료</p>
                  <p className="text-[11px] text-gray-400 mt-0.5">{segmentCount}개 자막 세그먼트</p>
                </div>
                <button
                  onClick={() => downloadSrt(srtContent)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-500 hover:bg-blue-600 text-white text-xs font-bold transition-colors"
                >
                  ↓ 다운로드
                </button>
              </div>
              <pre className="bg-white rounded-xl border border-gray-100 p-4 text-[11px] text-gray-500 font-mono leading-relaxed overflow-auto max-h-52">
                {srtContent.slice(0, 800)}{srtContent.length > 800 ? '\n\n...' : ''}
              </pre>
            </div>
          )}

          {/* 이미지 생성 패널 — SRT 완료 후, 로그인 사용자에게만 */}
          {status === 'done' && srtContent && user && sessionId && (
            <ImageSegmentPanel
              user={user}
              sessionId={sessionId}
              srtContent={srtContent}
              lyricText={lyricSnapshot}
            />
          )}
        </div>

        <p className="mt-8 text-[11px] text-gray-400">Powered by Gemini AI</p>
      </main>
    </div>
  )
}
