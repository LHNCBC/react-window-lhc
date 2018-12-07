import React, { PureComponent } from 'react';
import { FixedSizeGrid } from 'react-window';
import CodeBlock from '../../components/CodeBlock';
import ProfiledExample from '../../components/ProfiledExample';

import CODE from '../../code/StickyFixedSizeGrid.js';

import styles from './shared.module.css';

class Cell extends PureComponent {
  render() {
    const { columnIndex, rowIndex, style, className } = this.props;
    //console.log(this.props)
    return (
      <div
        className={className}
        style={style}
      >
        Item {rowIndex},{columnIndex}
      </div>
    );
  }
}

export default function() {
  return (
    <div className={styles.ExampleWrapper}>
      <h1 className={styles.ExampleHeader}>Basic Grid</h1>
      <div className={styles.Example}>
        <ProfiledExample
          className={styles.ExampleDemo}
          sandbox="fixed-size-grid"
        >
          <FixedSizeGrid
            className={styles.Grid}
            columnCount={1000}
            columnWidth={100}
            height={450}
            rowCount={1000}
            rowHeight={35}
            width={600}
            stickyColumns={2}
            stickyRows={3}
          >
            {Cell}
          </FixedSizeGrid>
        </ProfiledExample>
        <div className={styles.ExampleCode}>
          <CodeBlock value={CODE} />
        </div>
      </div>
    </div>
  );
}
