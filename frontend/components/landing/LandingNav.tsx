'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import logoImage from '@/app/logo.jpg';
import { LaunchButton } from './LaunchButton';

export function LandingNav() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <nav
      className={`fixed top-0 w-full z-50 transition-all duration-300 ${
        scrolled
          ? 'border-b border-white/5 bg-black/50 backdrop-blur-md'
          : 'border-b border-transparent bg-transparent backdrop-blur-none'
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 sm:h-20 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Image src={logoImage} alt="Mersi" width={32} height={32} className="rounded-lg w-8 h-8 shrink-0 object-cover" />
          <span className="text-lg sm:text-xl font-bold tracking-tight">Mersi</span>
        </div>
        <div className="hidden md:flex items-center gap-8 text-sm font-medium text-gray-400">
          <a className="hover:text-white transition-colors" href="#features">Features</a>
          <a className="hover:text-white transition-colors" href="#how-it-works">How it Works</a>
          <a className="hover:text-white transition-colors" href="#footer">Contact</a>
        </div>
        <LaunchButton className="bg-brand-primary hover:bg-brand-primary/90 text-white px-4 sm:px-6 py-2 sm:py-2.5 rounded-full text-xs sm:text-sm font-semibold transition-all shadow-lg shadow-brand-primary/20">
          Launch App
        </LaunchButton>
      </div>
    </nav>
  );
}
