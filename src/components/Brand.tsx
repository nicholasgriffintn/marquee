import { Link } from "react-router-dom";

import { classNames } from "../lib/class-names";

import styles from "./Brand.module.css";

export function BrandMark({ className }: { className?: string }) {
  return (
    <span className={classNames(styles.mark, className)} aria-hidden="true">
      <img src="/logo.svg" alt="" />
    </span>
  );
}

export function Brand({
  to,
  hideLabelOnMobile = false,
  className,
}: {
  to?: string;
  hideLabelOnMobile?: boolean;
  className?: string;
}) {
  const body = (
    <>
      <BrandMark />
      <span className={classNames(styles.label, hideLabelOnMobile && styles.labelResponsive)}>
        Marquee
      </span>
    </>
  );

  if (to) {
    return (
      <Link to={to} className={classNames(styles.brand, className)}>
        {body}
      </Link>
    );
  }

  return <div className={classNames(styles.brand, className)}>{body}</div>;
}
