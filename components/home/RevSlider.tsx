"use client";

import { useState, useEffect, useCallback } from "react";
import { ChevronLeft, ChevronRight, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useShop } from "@/context/ShopContext";

export default function RevSlider() {
  const { slides } = useShop();
  const [currentSlide, setCurrentSlide] = useState(0);

  const nextSlide = useCallback(() => {
    setCurrentSlide((prev) => (prev === slides.length - 1 ? 0 : prev + 1));
  }, [slides.length]);

  const prevSlide = () => {
    setCurrentSlide((prev) => (prev === 0 ? slides.length - 1 : prev - 1));
  };

  useEffect(() => {
    if (slides.length > 0) {
      const timer = setInterval(nextSlide, 8000);
      return () => clearInterval(timer);
    }
  }, [slides.length, nextSlide]);

  if (slides.length === 0) return null;

  return (
    <div className="relative w-full h-[600px] overflow-hidden group bg-[#1d2327]">
      {/* Slides */}
      {slides.map((slide, index) => (
        <div 
          key={slide.id}
          className={cn(
            "absolute inset-0 transition-all duration-1000 ease-in-out",
            index === currentSlide ? "opacity-100 scale-100" : "opacity-0 scale-105 pointer-events-none"
          )}
        >
          {/* Background Image */}
          <div className="absolute inset-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={slide.image} alt={slide.title} className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-black/50" />
          </div>

          {/* Content */}
          <div className="relative h-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col justify-center items-start text-white">
            <div className={cn(
              "space-y-6 max-w-2xl transform transition-all duration-700 delay-300",
              index === currentSlide ? "translate-y-0 opacity-100" : "translate-y-10 opacity-0"
            )}>
              <span className="text-primary font-black text-xs uppercase tracking-[0.3em]">
                {slide.subtitle}
              </span>
              <h2 className="text-4xl md:text-6xl font-black italic uppercase leading-tight">
                {slide.title}
              </h2>
              <p className="text-gray-300 text-lg max-w-xl leading-relaxed">
                {slide.description}
              </p>
              <div className="pt-4 flex items-center space-x-6">
                <a 
                  href={slide.buttonLink}
                  className="bg-primary text-white px-8 py-4 text-sm font-black uppercase tracking-widest hover:opacity-90 transition-all shadow-xl shadow-primary/30 flex items-center group/btn"
                >
                  {slide.buttonText}
                  <ArrowRight className="w-4 h-4 ml-2 group-hover/btn:translate-x-1 transition-transform" />
                </a>
                <a href="/tuning" className="text-white text-sm font-black uppercase tracking-widest hover:text-primary transition-colors border-b-2 border-white/20 hover:border-primary pb-1">
                  Learn More
                </a>
              </div>
            </div>
          </div>
        </div>
      ))}

      {/* Navigation Arrows */}
      <button 
        onClick={prevSlide}
        className="absolute left-6 top-1/2 -translate-y-1/2 p-3 rounded-full border border-white/20 text-white opacity-0 group-hover:opacity-100 transition-all hover:bg-white/10"
      >
        <ChevronLeft className="w-6 h-6" />
      </button>
      <button 
        onClick={nextSlide}
        className="absolute right-6 top-1/2 -translate-y-1/2 p-3 rounded-full border border-white/20 text-white opacity-0 group-hover:opacity-100 transition-all hover:bg-white/10"
      >
        <ChevronRight className="w-6 h-6" />
      </button>

      {/* Slide Indicators */}
      <div className="absolute bottom-10 left-1/2 -translate-x-1/2 flex space-x-3">
        {slides.map((_, index) => (
          <button 
            key={index}
            onClick={() => setCurrentSlide(index)}
            className={cn(
              "w-12 h-1 rounded-full transition-all duration-300",
              index === currentSlide ? "bg-orange-600" : "bg-white/20"
            )}
          />
        ))}
      </div>
    </div>
  );
}
