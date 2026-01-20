import { ReactNode } from "react";
import "./ResponsiveSpotlight.css";

type ResponsiveSpotlightProps = {
  title: string;
  eyebrow?: string;
  description: string;
  media?: ReactNode;
  ctaLabel: string;
  onCtaClick?: () => void;
};

/**
 * Mobile-first spotlight section that reflows from stacked content on phones
 * to a split layout on tablet without media query churn in the JSX.
 */
export const ResponsiveSpotlight = ({
  title,
  eyebrow,
  description,
  media,
  ctaLabel,
  onCtaClick,
}: ResponsiveSpotlightProps) => (
  <section className="spotlight">
    <div className="spotlight__body">
      {eyebrow && <span className="spotlight__eyebrow">{eyebrow}</span>}
      <h2 className="spotlight__title">{title}</h2>
      <p className="spotlight__description">{description}</p>
      <button type="button" className="spotlight__cta" onClick={onCtaClick}>
        {ctaLabel}
      </button>
    </div>

    {media && <div className="spotlight__media">{media}</div>}
  </section>
);
