'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'

interface Banner {
  id: string; title: string; subtitle: string | null; description: string | null
  link_url: string | null; image_url: string | null; image_url_mobile: string | null; display_order: number
}

export default function HomeBannerCarousel({ banners }: { banners: Banner[] }) {
  const [activeBanner, setActiveBanner] = useState(0)
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  useEffect(() => {
    if (banners.length <= 1) return
    const t = setInterval(() => setActiveBanner(p => (p + 1) % banners.length), 5000)
    return () => clearInterval(t)
  }, [banners.length])

  function prevBanner() { setActiveBanner(p => (p - 1 + banners.length) % banners.length) }
  function nextBanner() { setActiveBanner(p => (p + 1) % banners.length) }

  // Escolhe imagem certa: mobile ou desktop
  function getBannerImage(b: Banner): string | null {
    if (isMobile && b.image_url_mobile) return b.image_url_mobile
    return b.image_url
  }

  const currentBanner = banners[activeBanner]

  return (
    <div className="banner-outer">
      {currentBanner ? (
        <a href={currentBanner.link_url || '#'} style={{ display: 'block', textDecoration: 'none' }}>
          <div className="banner-inner-wrap">
            {getBannerImage(currentBanner)
              ? <Image unoptimized src={getBannerImage(currentBanner)!} alt={currentBanner.title} fill priority sizes="100vw" style={{ objectFit: 'cover' }} />
              : <div className="banner-deco">🏗️</div>
            }
            <div className="banner-content-wrap">
              <div className="banner-title-text">{currentBanner.title}</div>
              {currentBanner.subtitle && <div className="banner-sub-text">{currentBanner.subtitle}</div>}
              {currentBanner.description && <div className="banner-desc-text">{currentBanner.description}</div>}
            </div>
          </div>
        </a>
      ) : (
        <div className="banner-inner-wrap" style={{ justifyContent: 'center' }}>
          <div style={{ textAlign: 'center', color: '#555' }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>📢</div>
            <div style={{ fontFamily: '"Bebas Neue", sans-serif', fontSize: 20, color: '#C9951A' }}>Espaço para anunciante</div>
            <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>Entre em contato para anunciar aqui</div>
          </div>
        </div>
      )}

      {/* SETAS + DOTS — fora do banner, abaixo da imagem, entre banner e categorias */}
      {banners.length > 1 && (
        <div className="banner-dots-outer">
          <button className="banner-arrow" onClick={prevBanner} aria-label="Banner anterior">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#666" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <div className="banner-dots-row">
            {banners.map((_, i) => (
              <span
                key={i}
                className={`banner-dot${i === activeBanner ? ' on' : ''}`}
                style={{ width: i === activeBanner ? 22 : 8 }}
                onClick={() => setActiveBanner(i)}
              />
            ))}
          </div>
          <button className="banner-arrow" onClick={nextBanner} aria-label="Próximo banner">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#666" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        </div>
      )}
    </div>
  )
}
