import type { DiagramSpec, DiagramNode } from "../../domain/tour-notes";
import { classNames } from "../../lib/class-names";

import styles from "./TourDiagram.module.css";

function Node({ node }: { node: DiagramNode }) {
  return (
    <div className={classNames(styles.node, styles[node.tone ?? "step"])}>
      <strong>{node.label}</strong>
      {node.note ? <small>{node.note}</small> : null}
    </div>
  );
}

function Row({ nodes }: { nodes: DiagramNode[] }) {
  return (
    <div className={styles.row}>
      {nodes.map((node, index) => (
        <div key={node.label} className={styles.cell}>
          {index > 0 && (
            <span className={styles.arrow} aria-hidden="true">
              →
            </span>
          )}
          <Node node={node} />
        </div>
      ))}
    </div>
  );
}

export function TourDiagram({ spec }: { spec: DiagramSpec }) {
  return (
    <figure className={styles.diagram}>
      <div className={styles.flow}>
        {spec.lanes.length > 0 && (
          <div className={styles.lanes}>
            {spec.lanes.map((lane) => (
              <div key={lane.name} className={styles.lane}>
                <p className={styles.laneName}>{lane.name}</p>
                <Row nodes={lane.nodes} />
              </div>
            ))}
          </div>
        )}

        {spec.after.length > 0 && (
          <>
            {spec.lanes.length > 0 && (
              <span className={styles.merge} aria-hidden="true">
                ↓
              </span>
            )}
            <Row nodes={spec.after} />
          </>
        )}
      </div>

      <figcaption className={styles.caption}>{spec.caption}</figcaption>
    </figure>
  );
}
