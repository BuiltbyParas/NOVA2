export function BrowserSurface() {
  return (
    <div className="surface surface--browser">
      <div className="browser__bar">
        <div className="browser__nav">
          <span className="chevron chevron--back" />
          <span className="chevron chevron--forward" />
        </div>
        <div className="browser__address">
          <span className="browser__lock" />
          nova://spatial-computing
        </div>
      </div>
      <div className="browser__page">
        <div className="browser__eyebrow">Interface research</div>
        <h1 className="browser__title">Depth as an organising principle</h1>
        <p className="browser__body">
          A flat desktop forces every task into the same plane. Distance gives the
          system somewhere to put what matters less, without hiding it.
        </p>
        <div className="browser__media" />
        <div className="browser__columns">
          <div className="browser__column">
            <span className="line line--80" />
            <span className="line line--100" />
            <span className="line line--60" />
          </div>
          <div className="browser__column">
            <span className="line line--100" />
            <span className="line line--70" />
            <span className="line line--90" />
          </div>
        </div>
      </div>
    </div>
  );
}
