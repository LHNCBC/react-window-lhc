// @flow

import memoizeOne from 'memoize-one';
import { createElement, PureComponent } from 'react';
import './default.css';
export type ScrollToAlign = 'auto' | 'center' | 'start' | 'end';

type itemSize = number | ((index: number) => number);
type ItemKeyGetter = (indices: {
  columnIndex: number,
  rowIndex: number,
  stickyRow?: boolean,
  stickyCol?: boolean,
}) => any;

type RenderComponentProps<T> = {|
  columnIndex: number,
  data: T,
  isScrolling?: boolean,
  rowIndex: number,
  style: Object,
|};
export type RenderComponent<T> = React$ComponentType<
  $Shape<RenderComponentProps<T>>
>;

type ScrollDirection = 'forward' | 'backward';

type OnItemsRenderedCallback = ({
  overscanColumnStartIndex: number,
  overscanColumnStopIndex: number,
  overscanRowStartIndex: number,
  overscanRowStopIndex: number,
  visibleColumnStartIndex: number,
  visibleColumnStopIndex: number,
  visibleRowStartIndex: number,
  visibleRowStopIndex: number,
}) => void;
type OnScrollCallback = ({
  horizontalScrollDirection: ScrollDirection,
  scrollLeft: number,
  scrollTop: number,
  scrollUpdateWasRequested: boolean,
  verticalScrollDirection: ScrollDirection,
}) => void;

type ScrollEvent = SyntheticEvent<HTMLDivElement>;
type ItemStyleCache = { [key: string]: Object };

export type Props<T> = {|
  children: RenderComponent<T>,
  className?: string,
  columnCount: number,
  columnWidth: itemSize,
  height: number,
  initialScrollLeft?: number,
  initialScrollTop?: number,
  innerRef?: any,
  innerTagName?: string,
  itemData: T,
  itemKey?: ItemKeyGetter,
  onItemsRendered?: OnItemsRenderedCallback,
  onScroll?: OnScrollCallback,
  outerRef?: any,
  outerTagName?: string,
  overscanCount: number,
  rowCount: number,
  rowHeight: itemSize,
  style?: Object,
  useIsScrolling: boolean,
  width: number,
  stickyColumns: number,
  stickyRows: number,
|};

type State = {|
  isScrolling: boolean,
  horizontalScrollDirection: ScrollDirection,
  scrollLeft: number,
  scrollTop: number,
  scrollUpdateWasRequested: boolean,
  verticalScrollDirection: ScrollDirection,
|};

type getItemOffset = (
  props: Props<any>,
  index: number,
  instanceProps: any
) => number;
type getItemSize = (
  props: Props<any>,
  index: number,
  instanceProps: any
) => number;
type getEstimatedTotalSize = (props: Props<any>, instanceProps: any) => number;
type GetOffsetForItemAndAlignment = (
  props: Props<any>,
  index: number,
  align: ScrollToAlign,
  scrollOffset: number,
  instanceProps: any
) => number;
type GetStartIndexForOffset = (
  props: Props<any>,
  offset: number,
  instanceProps: any
) => number;
type GetStopIndexForStartIndex = (
  props: Props<any>,
  startIndex: number,
  scrollOffset: number,
  instanceProps: any
) => number;
type InitInstanceProps = (props: Props<any>, instance: any) => any;
type ValidateProps = (props: Props<any>) => void;

const IS_SCROLLING_DEBOUNCE_INTERVAL = 150;

const defaultItemKey: ItemKeyGetter = ({ columnIndex, rowIndex, stickyRow, stickyCol}) => {
  const rowKey = stickyRow ? `S${rowIndex}` : `${rowIndex}`;
  const colKey = stickyCol ? `S${columnIndex}` : `${columnIndex}`;
  return `${rowKey}:${colKey}`;
};

export default function createGridComponent({
  getColumnOffset,
  getColumnStartIndexForOffset,
  getColumnStopIndexForStartIndex,
  getColumnWidth,
  getEstimatedTotalHeight,
  getEstimatedTotalWidth,
  getOffsetForColumnAndAlignment,
  getOffsetForRowAndAlignment,
  getRowHeight,
  getRowOffset,
  getRowStartIndexForOffset,
  getRowStopIndexForStartIndex,
  initInstanceProps,
  shouldResetStyleCacheOnItemSizeChange,
  validateProps,
}: {|
  getColumnOffset: getItemOffset,
  getColumnStartIndexForOffset: GetStartIndexForOffset,
  getColumnStopIndexForStartIndex: GetStopIndexForStartIndex,
  getColumnWidth: getItemSize,
  getEstimatedTotalHeight: getEstimatedTotalSize,
  getEstimatedTotalWidth: getEstimatedTotalSize,
  getOffsetForColumnAndAlignment: GetOffsetForItemAndAlignment,
  getOffsetForRowAndAlignment: GetOffsetForItemAndAlignment,
  getRowOffset: getItemOffset,
  getRowHeight: getItemSize,
  getRowStartIndexForOffset: GetStartIndexForOffset,
  getRowStopIndexForStartIndex: GetStopIndexForStartIndex,
  initInstanceProps: InitInstanceProps,
  shouldResetStyleCacheOnItemSizeChange: boolean,
  validateProps: ValidateProps,
|}) {
  return class Grid<T> extends PureComponent<Props<T>, State> {
    _instanceProps: any = initInstanceProps(this.props, this);
    _resetIsScrollingTimeoutId: TimeoutID | null = null;
    _outerRef: ?HTMLDivElement;

    static defaultProps = {
      innerTagName: 'div',
      itemData: undefined,
      outerTagName: 'div',
      overscanCount: 1,
      useIsScrolling: false,
    };

    state: State = {
      isScrolling: false,
      horizontalScrollDirection: 'forward',
      scrollLeft:
        typeof this.props.initialScrollLeft === 'number'
          ? this.props.initialScrollLeft
          : 0,
      scrollTop:
        typeof this.props.initialScrollTop === 'number'
          ? this.props.initialScrollTop
          : 0,
      scrollUpdateWasRequested: false,
      verticalScrollDirection: 'forward',
    };

    // Always use explicit constructor for React components.
    // It produces less code after transpilation. (#26)
    // eslint-disable-next-line no-useless-constructor
    constructor(props: Props<T>) {
      super(props);
    }

    static getDerivedStateFromProps(
      nextProps: Props<T>,
      prevState: State
    ): $Shape<State> {
      validateSharedProps(nextProps);
      validateProps(nextProps);
      return null;
    }

    scrollTo({
      scrollLeft,
      scrollTop,
    }: {
      scrollLeft: number,
      scrollTop: number,
    }): void {
      this.setState(prevState => {
        if (scrollLeft === undefined) {
          scrollLeft = prevState.scrollLeft;
        }
        if (scrollTop === undefined) {
          scrollTop = prevState.scrollTop;
        }

        return {
          horizontalScrollDirection:
            prevState.scrollLeft < scrollLeft ? 'forward' : 'backward',
          scrollLeft: scrollLeft,
          scrollTop: scrollTop,
          scrollUpdateWasRequested: true,
          verticalScrollDirection:
            prevState.scrollTop < scrollTop ? 'forward' : 'backward',
        };
      }, this._resetIsScrollingDebounced);
    }

    scrollToItem({
      align = 'auto',
      columnIndex,
      rowIndex,
    }: {
      align: ScrollToAlign,
      columnIndex: number,
      rowIndex: number,
    }): void {
      const { scrollLeft, scrollTop } = this.state;

      this.scrollTo({
        scrollLeft: getOffsetForColumnAndAlignment(
          this.props,
          columnIndex,
          align,
          scrollLeft,
          this._instanceProps
        ),
        scrollTop: getOffsetForRowAndAlignment(
          this.props,
          rowIndex,
          align,
          scrollTop,
          this._instanceProps
        ),
      });
    }

    componentDidMount() {
      const { initialScrollLeft, initialScrollTop } = this.props;
      if (typeof initialScrollLeft === 'number' && this._outerRef != null) {
        ((this._outerRef: any): HTMLDivElement).scrollLeft = initialScrollLeft;
      }
      if (typeof initialScrollTop === 'number' && this._outerRef != null) {
        ((this._outerRef: any): HTMLDivElement).scrollTop = initialScrollTop;
      }

      this._callPropsCallbacks();
    }

    componentDidUpdate() {
      const { scrollLeft, scrollTop, scrollUpdateWasRequested } = this.state;
      if (scrollUpdateWasRequested && this._outerRef !== null) {
        ((this._outerRef: any): HTMLDivElement).scrollLeft = scrollLeft;
        ((this._outerRef: any): HTMLDivElement).scrollTop = scrollTop;
      }

      this._callPropsCallbacks();
    }

    componentWillUnmount() {
      if (this._resetIsScrollingTimeoutId !== null) {
        clearTimeout(this._resetIsScrollingTimeoutId);
      }
    }

    render() {
      const {
        children,
        className,
        columnCount,
        height,
        innerRef,
        innerTagName,
        itemData,
        itemKey = defaultItemKey,
        outerTagName,
        rowCount,
        style,
        useIsScrolling,
        width,
        stickyColumns,
        stickyRows,
      } = this.props;
      const { isScrolling } = this.state;

      const [
        columnStartIndex,
        columnStopIndex,
      ] = this._getHorizontalRangeToRender();
      const [
        rowStartIndex, 
        rowStopIndex
      ] = this._getVerticalRangeToRender();

      // console.log('stickyRows:' + stickyRows);
      // console.log('stickyColumns:' + stickyColumns);
      // console.log(rowCount);

      const items = [];
      if (columnCount > 0 && rowCount) {
        if (stickyRows) {
          // there could be multiple sticky rows
          for (
            let stickyRowIndex = 0;
            stickyRowIndex < stickyRows;
            stickyRowIndex++
          ) {
            //if stickyRows and stickyColumns, create top-most DIVs that always covers the left-top cells.
            if (stickyColumns) {
              for (
                let stickyColumnIndex = 0;
                stickyColumnIndex < stickyColumns;
                stickyColumnIndex++
              ) {
                items.push(
                  createElement(children, {
                    columnIndex: stickyColumnIndex,
                    data: itemData,
                    isScrolling: useIsScrolling ? isScrolling : undefined,
                    key: itemKey({ columnIndex: stickyColumnIndex, rowIndex: stickyRowIndex, stickyRow: true, stickyCol: true }),
                    rowIndex: stickyRowIndex,
                    style: this._getItemStyle(stickyRowIndex, stickyColumnIndex, true, true),
                    className: 'StickyRowColCell', //this._getItemClassName(true, true),
                  })
                );
              }
            }
            // cells in sticky rows
            for (
              let columnIndex = columnStartIndex;
              columnIndex <= columnStopIndex;
              columnIndex++
            ) {
              items.push(
                createElement(children, {
                  columnIndex: columnIndex,
                  data: itemData,
                  isScrolling: useIsScrolling ? isScrolling : undefined,
                  key: itemKey({ columnIndex: columnIndex, rowIndex: stickyRowIndex, stickyRow: true }),
                  rowIndex: stickyRowIndex,
                  style: this._getItemStyle(stickyRowIndex, columnIndex, true, false),
                  className: 'StickyRowCell', //this._getItemClassName(true, false),

                })
              );
            }
          }
        }

        // all cells
        for (
          let rowIndex = rowStartIndex;
          rowIndex <= rowStopIndex;
          rowIndex++
        ) {
          // cell in sticky columns
          if (stickyColumns) {
            if (stickyColumns) {
              for (
                let stickyColumnIndex = 0;
                stickyColumnIndex < stickyColumns;
                stickyColumnIndex++
              ) {
                items.push(
                  createElement(children, {
                    columnIndex: stickyColumnIndex,
                    data: itemData,
                    isScrolling: useIsScrolling ? isScrolling : undefined,
                    key: itemKey({ columnIndex: stickyColumnIndex, rowIndex, stickyCol: true }),
                    rowIndex: rowIndex,
                    style: this._getItemStyle(rowIndex, stickyColumnIndex, false, true),
                    className: 'StickyColCell',
                  })
                );
              }
            }

          }
          // all other cells in non-sticky columns/rows
          for (
            let columnIndex = columnStartIndex;
            columnIndex <= columnStopIndex;
            columnIndex++
          ) {
            items.push(
              createElement(children, {
                columnIndex,
                data: itemData,
                isScrolling: useIsScrolling ? isScrolling : undefined,
                key: itemKey({ columnIndex, rowIndex }),
                rowIndex,
                style: this._getItemStyle(rowIndex, columnIndex),
                className: 'GridCell',
              })
            );
          }
        }
      }

      // Read this value AFTER items have been created,
      // So their actual sizes (if variable) are taken into consideration.
      const estimatedTotalHeight = getEstimatedTotalHeight(
        this.props,
        this._instanceProps
      );
      const estimatedTotalWidth = getEstimatedTotalWidth(
        this.props,
        this._instanceProps
      );

      return createElement(
        ((outerTagName: any): string),
        {
          className,
          onScroll: this._onScroll,
          ref: this._outerRefSetter,
          style: {
            position: 'relative',
            height,
            width,
            overflow: 'auto',
            WebkitOverflowScrolling: 'touch',
            willChange: 'transform',
            ...style,
          },
        },
        createElement(((innerTagName: any): string), {
          children: items,
          ref: innerRef,
          style: {
            height: estimatedTotalHeight,
            pointerEvents: isScrolling ? 'none' : '',
            width: estimatedTotalWidth,
          },
        })
      );
    }

    _callOnItemsRendered: (
      overscanColumnStartIndex: number,
      overscanColumnStopIndex: number,
      overscanRowStartIndex: number,
      overscanRowStopIndex: number,
      visibleColumnStartIndex: number,
      visibleColumnStopIndex: number,
      visibleRowStartIndex: number,
      visibleRowStopIndex: number
    ) => void;
    _callOnItemsRendered = memoizeOne(
      (
        overscanColumnStartIndex: number,
        overscanColumnStopIndex: number,
        overscanRowStartIndex: number,
        overscanRowStopIndex: number,
        visibleColumnStartIndex: number,
        visibleColumnStopIndex: number,
        visibleRowStartIndex: number,
        visibleRowStopIndex: number
      ) =>
        ((this.props.onItemsRendered: any): OnItemsRenderedCallback)({
          overscanColumnStartIndex,
          overscanColumnStopIndex,
          overscanRowStartIndex,
          overscanRowStopIndex,
          visibleColumnStartIndex,
          visibleColumnStopIndex,
          visibleRowStartIndex,
          visibleRowStopIndex,
        })
    );

    _callOnScroll: (
      scrollLeft: number,
      scrollTop: number,
      horizontalScrollDirection: ScrollDirection,
      verticalScrollDirection: ScrollDirection,
      scrollUpdateWasRequested: boolean
    ) => void;
    _callOnScroll = memoizeOne(
      (
        scrollLeft: number,
        scrollTop: number,
        horizontalScrollDirection: ScrollDirection,
        verticalScrollDirection: ScrollDirection,
        scrollUpdateWasRequested: boolean
      ) =>
        ((this.props.onScroll: any): OnScrollCallback)({
          horizontalScrollDirection,
          scrollLeft,
          scrollTop,
          verticalScrollDirection,
          scrollUpdateWasRequested,
        })
    );

    _callPropsCallbacks() {
      const { columnCount, onItemsRendered, onScroll, rowCount } = this.props;

      if (typeof onItemsRendered === 'function') {
        if (columnCount > 0 && rowCount > 0) {
          const [
            overscanColumnStartIndex,
            overscanColumnStopIndex,
            visibleColumnStartIndex,
            visibleColumnStopIndex,
          ] = this._getHorizontalRangeToRender();
          const [
            overscanRowStartIndex,
            overscanRowStopIndex,
            visibleRowStartIndex,
            visibleRowStopIndex,
          ] = this._getVerticalRangeToRender();
          this._callOnItemsRendered(
            overscanColumnStartIndex,
            overscanColumnStopIndex,
            overscanRowStartIndex,
            overscanRowStopIndex,
            visibleColumnStartIndex,
            visibleColumnStopIndex,
            visibleRowStartIndex,
            visibleRowStopIndex
          );
        }
      }

      if (typeof onScroll === 'function') {
        const {
          horizontalScrollDirection,
          scrollLeft,
          scrollTop,
          scrollUpdateWasRequested,
          verticalScrollDirection,
        } = this.state;
        this._callOnScroll(
          scrollLeft,
          scrollTop,
          horizontalScrollDirection,
          verticalScrollDirection,
          scrollUpdateWasRequested
        );
      }
    }

    // Lazily create and cache item styles while scrolling,
    // So that pure component sCU will prevent re-renders.
    // We maintain this cache, and pass a style prop rather than index,
    // So that List can clear cached styles and force item re-render if necessary.
    _getItemStyle: (rowIndex: number, columnIndex: number, stickyRow: boolean, stickyCol: boolean) => Object;
    _getItemStyle = (rowIndex: number, columnIndex: number, stickyRow: boolean=false, stickyCol: boolean=false): Object => {
      const rowKey = stickyRow ? `S${rowIndex}` : `${rowIndex}`;
      const colKey = stickyCol ? `S${columnIndex}` : `${columnIndex}`;
      const key = `${rowKey}:${colKey}`;

      const itemStyleCache = this._getItemStyleCache(
        shouldResetStyleCacheOnItemSizeChange && this.props.columnWidth,
        shouldResetStyleCacheOnItemSizeChange && this.props.rowHeight
      );

      let style;
      if (stickyRow && stickyCol) {
        style = {
          position: 'absolute',
          left: this._getStickyColumnOffset(columnIndex),
          top: this._getStickyRowOffset(rowIndex),
          height: getRowHeight(this.props, rowIndex, this._instanceProps),
          width: getColumnWidth(this.props, columnIndex, this._instanceProps),
        };
      }
      else if (stickyRow ) {
        style = {
          position: 'absolute',
          left: getColumnOffset(this.props, columnIndex, this._instanceProps),
          top: this._getStickyRowOffset(rowIndex),
          height: getRowHeight(this.props, rowIndex, this._instanceProps),
          width: getColumnWidth(this.props, columnIndex, this._instanceProps),
        };
      }
      else if (stickyCol) {
        style = {
          position: 'absolute',
          left: this._getStickyColumnOffset(columnIndex),
          top: getRowOffset(this.props, rowIndex, this._instanceProps),
          height: getRowHeight(this.props, rowIndex, this._instanceProps),
          width: getColumnWidth(this.props, columnIndex, this._instanceProps),
        };
      }
      else if (itemStyleCache.hasOwnProperty(key)) {
        style = itemStyleCache[key];
      } else {
        style = {
          position: 'absolute',
          left: getColumnOffset(this.props, columnIndex, this._instanceProps),
          top: getRowOffset(this.props, rowIndex, this._instanceProps),
          height: getRowHeight(this.props, rowIndex, this._instanceProps),
          width: getColumnWidth(this.props, columnIndex, this._instanceProps),
        };
        itemStyleCache[key] = style;
      }
      return style;
    }


    _getItemStyleCache: (_: any, __: any) => ItemStyleCache;
    _getItemStyleCache = memoizeOne((_: any, __: any) => ({}));

    _getHorizontalRangeToRender(): [number, number, number, number] {
      const { columnCount, overscanCount, rowCount } = this.props;
      const { horizontalScrollDirection, scrollLeft } = this.state;

      if (columnCount === 0 || rowCount === 0) {
        return [0, 0, 0, 0];
      }

      const startIndex = getColumnStartIndexForOffset(
        this.props,
        scrollLeft,
        this._instanceProps
      );
      const stopIndex = getColumnStopIndexForStartIndex(
        this.props,
        startIndex,
        scrollLeft,
        this._instanceProps
      );

      // Overscan by one item in each direction so that tab/focus works.
      // If there isn't at least one extra item, tab loops back around.
      const overscanBackward =
        horizontalScrollDirection === 'backward'
          ? Math.max(1, overscanCount)
          : 1;
      const overscanForward =
        horizontalScrollDirection === 'forward'
          ? Math.max(1, overscanCount)
          : 1;

      return [
        Math.max(0, startIndex - overscanBackward),
        Math.max(0, Math.min(columnCount - 1, stopIndex + overscanForward)),
        startIndex,
        stopIndex,
      ];
    }

    _getStickyColumnOffset(colIndex: number): number {
      const { scrollLeft } = this.state;
      let offset = scrollLeft;
      while (colIndex >0) {
        offset += getColumnWidth(this.props, colIndex - 1, this._instanceProps);
        colIndex--;
      }
      return offset;
    }

    _getStickyRowOffset(rowIndex: number): number {
      const { scrollTop } = this.state;
      let offset = scrollTop;
      while (rowIndex > 0) {
        offset += getRowHeight(this.props, rowIndex - 1, this._instanceProps);
        rowIndex--;
      }
      return offset;
    }

    _getVerticalRangeToRender(): [number, number, number, number] {
      const { columnCount, rowCount, overscanCount } = this.props;
      const { verticalScrollDirection, scrollTop } = this.state;

      if (columnCount === 0 || rowCount === 0) {
        return [0, 0, 0, 0];
      }

      const startIndex = getRowStartIndexForOffset(
        this.props,
        scrollTop,
        this._instanceProps
      );
      const stopIndex = getRowStopIndexForStartIndex(
        this.props,
        startIndex,
        scrollTop,
        this._instanceProps
      );

      // Overscan by one item in each direction so that tab/focus works.
      // If there isn't at least one extra item, tab loops back around.
      const overscanBackward =
        verticalScrollDirection === 'backward' ? Math.max(1, overscanCount) : 1;
      const overscanForward =
        verticalScrollDirection === 'forward' ? Math.max(1, overscanCount) : 1;

      return [
        Math.max(0, startIndex - overscanBackward),
        Math.max(0, Math.min(rowCount - 1, stopIndex + overscanForward)),
        startIndex,
        stopIndex,
      ];
    }

    _onScroll = (event: ScrollEvent): void => {
      const { scrollLeft, scrollTop } = event.currentTarget;
      this.setState(prevState => {
        if (
          prevState.scrollLeft === scrollLeft &&
          prevState.scrollTop === scrollTop
        ) {
          // Scroll position may have been updated by cDM/cDU,
          // In which case we don't need to trigger another render,
          // And we don't want to update state.isScrolling.
          return null;
        }

        return {
          isScrolling: true,
          horizontalScrollDirection:
            prevState.scrollLeft < scrollLeft ? 'forward' : 'backward',
          scrollLeft,
          scrollTop,
          verticalScrollDirection:
            prevState.scrollTop < scrollTop ? 'forward' : 'backward',
          scrollUpdateWasRequested: false,
        };
      }, this._resetIsScrollingDebounced);
    };

    _outerRefSetter = (ref: any): void => {
      const { outerRef } = this.props;

      this._outerRef = ((ref: any): HTMLDivElement);

      if (typeof outerRef === 'function') {
        outerRef(ref);
      } else if (
        outerRef != null &&
        typeof outerRef === 'object' &&
        outerRef.hasOwnProperty('current')
      ) {
        outerRef.current = ref;
      }
    };

    _resetIsScrollingDebounced = () => {
      if (this._resetIsScrollingTimeoutId !== null) {
        clearTimeout(this._resetIsScrollingTimeoutId);
      }

      this._resetIsScrollingTimeoutId = setTimeout(
        this._resetIsScrolling,
        IS_SCROLLING_DEBOUNCE_INTERVAL
      );
    };

    _resetIsScrollingDebounced = () => {
      if (this._resetIsScrollingTimeoutId !== null) {
        clearTimeout(this._resetIsScrollingTimeoutId);
      }

      this._resetIsScrollingTimeoutId = setTimeout(
        this._resetIsScrolling,
        IS_SCROLLING_DEBOUNCE_INTERVAL
      );
    };

    _resetIsScrolling = () => {
      this._resetIsScrollingTimeoutId = null;

      this.setState({ isScrolling: false }, () => {
        // Clear style cache after state update has been committed.
        // This way we don't break pure sCU for items that don't use isScrolling param.
        this._getItemStyleCache(-1);
      });
    };
  };
}

const validateSharedProps = ({ children, height, width }: Props<any>): void => {
  if (process.env.NODE_ENV !== 'production') {
    if (children == null) {
      throw Error(
        'An invalid "children" prop has been specified. ' +
          'Value should be a React component. ' +
          `"${children === null ? 'null' : typeof children}" was specified.`
      );
    }

    if (typeof width !== 'number') {
      throw Error(
        'An invalid "width" prop has been specified. ' +
          'Grids must specify a number for width. ' +
          `"${width === null ? 'null' : typeof width}" was specified.`
      );
    }

    if (typeof height !== 'number') {
      throw Error(
        'An invalid "height" prop has been specified. ' +
          'Grids must specify a number for height. ' +
          `"${height === null ? 'null' : typeof height}" was specified.`
      );
    }
  }
};
