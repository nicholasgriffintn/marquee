import styles from "./ProgressBar.module.css";

export function ProgressBar({ done, total }: { done: number; total: number }) {
  return (
    <div className={styles.bar} aria-hidden="true">
      <i style={{ width: `${Math.min(100, (done / Math.max(1, total)) * 100)}%` }} />
    </div>
  );
}
