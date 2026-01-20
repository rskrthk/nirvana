import React, { useEffect, useMemo, useRef, useState } from 'react';
import RetreatSessionImage from '../assets/2636cf86fd541058796aa888a22308faa76d54c6.png';
import SunriseYogaImage from '../assets/2ac9587117280e79e082f330735cc66ae2b7a734.jpg';
import MeditationFlowImage from '../assets/e983ce2b4b2ccbf0bbc60eaa3641675e75f0d223.jpg';
import SplashScreenImage from '../assets/Splash screen (2).png';
import './Carousel.css';

type Slide = {
  src: string;
  description: React.ReactNode;
  showCta?: boolean;
  objectPosition?: string;
};

const AUTO_ADVANCE_MS = 4000;
const SPLASH_DURATION_MS = 3000;

type CarouselProps = {
  onContinue?: () => void;
};

const Carousel: React.FC<CarouselProps> = ({ onContinue }) => {
  const slides = useMemo<Slide[]>(
    () => [
      {
        src: SunriseYogaImage,
        objectPosition: '100% center',
        description: (
          <>
            <span className="carousel__line">
              <span className="carousel__description-primary">Yoga</span>
            </span>
            <span className="carousel__line">made personal</span>
            <span className="carousel__line">
              for a <span className="carousel__description-primary">healthy,</span>
            </span>
            <span className="carousel__line">
              <span className="carousel__description-primary">happy</span> you.
            </span>
          </>
        ),
      },
      {
        src:MeditationFlowImage,
        description: (
          <>
            <span className="carousel__line">
              <span className="carousel__description-primary">Yoga</span>
            </span>
            <span className="carousel__line">made personal</span>
            <span className="carousel__line">
              for a <span className="carousel__description-primary">healthy,</span>
            </span>
            <span className="carousel__line">
              <span className="carousel__description-primary">happy</span> you.
            </span>
          </>
        ),
      },
      {
        src: RetreatSessionImage,
        description: (
          <>
            <span className="carousel__line">
              <span className="carousel__description-primary">Yoga</span>
            </span>
            <span className="carousel__line">made personal</span>
            <span className="carousel__line">
              for a <span className="carousel__description-primary">healthy,</span>
            </span>
            <span className="carousel__line">
              <span className="carousel__description-primary">happy</span> you.
            </span>
          </>
        ),
        showCta: true,
      },
    ],
    []
  );

  const [activeIndex, setActiveIndex] = useState(0);
  const [isSplashVisible, setIsSplashVisible] = useState(true);
  const touchStartX = useRef<number | null>(null);
  const touchCurrentX = useRef<number | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setIsSplashVisible(false), SPLASH_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (isSplashVisible || slides.length <= 1) {
      return;
    }

    const timer = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % slides.length);
    }, AUTO_ADVANCE_MS);

    return () => window.clearInterval(timer);
  }, [slides, isSplashVisible]);

  const goTo = (nextIndex: number) => {
    const boundedIndex = (nextIndex + slides.length) % slides.length;
    setActiveIndex(boundedIndex);
  };

  const handleContinue = () => {
    if (onContinue) {
      onContinue();
    }
  };

  const resetTouchTracking = () => {
    touchStartX.current = null;
    touchCurrentX.current = null;
  };

  const handleTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
    touchStartX.current = event.touches[0].clientX;
    touchCurrentX.current = null;
  };

  const handleTouchMove = (event: React.TouchEvent<HTMLDivElement>) => {
    touchCurrentX.current = event.touches[0].clientX;
  };

  const handleTouchEnd = () => {
    if (touchStartX.current === null || touchCurrentX.current === null) {
      resetTouchTracking();
      return;
    }

    const delta = touchStartX.current - touchCurrentX.current;
    if (Math.abs(delta) > 40) {
      goTo(activeIndex + (delta > 0 ? 1 : -1));
    }

    resetTouchTracking();
  };

  if (isSplashVisible) {
    return (
      <div className="carousel carousel--splash" aria-label="Splash screen">
        <img
          src={SplashScreenImage}
          alt="Nirvaana Yoga splash"
          className="carousel__splash-image"
          draggable={false}
        />
      </div>
    );
  }

  return (
    <div className="carousel">
      <div
        className="carousel__viewport"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={resetTouchTracking}
      >
        <div
          className="carousel__track"
          style={{
            transform: `translateX(-${activeIndex * 100}%)`,
          }}
        >
          {slides.map((slide) => (
            <div key={slide.src} className="carousel__slide">
              <img
                src={slide.src}
                className="carousel__image"
                draggable={false}
                style={slide.objectPosition ? { objectPosition: slide.objectPosition } : undefined}
              />
              <div className="carousel__overlay">
                <div className="carousel__copy">
                  <p className="carousel__description">{slide.description}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="carousel__indicators" role="tablist" aria-label="Carousel slides">
        {slides[activeIndex]?.showCta && (
          <button type="button" className="carousel__cta-button" onClick={handleContinue}>
            Continue
          </button>
        )}
        <div className="carousel__dots">
          {slides.map((slide, index) => (
            <button
              key={slide.src}
              type="button"
              className={`carousel__dot${index === activeIndex ? ' carousel__dot--active' : ''}`}
              aria-label={`Go to slide ${index + 1}`}
              onClick={() => goTo(index)}
              role="tab"
              aria-selected={index === activeIndex}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

export default Carousel;
