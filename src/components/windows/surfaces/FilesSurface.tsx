const PLACES = ['Recent', 'Projects', 'nova', 'Research', 'Archive'];
const FOLDERS = ['systems', 'components', 'state', 'data'];
const DOCUMENTS = [
  { name: 'spatial-model.md', meta: '4 KB' },
  { name: 'depth-study.png', meta: '1.2 MB' },
  { name: 'phase-one.md', meta: '9 KB' },
];

export function FilesSurface() {
  return (
    <div className="surface surface--files">
      <div className="files__sidebar">
        {PLACES.map((place, index) => (
          <div key={place} className={`files__place${index === 2 ? ' is-active' : ''}`}>
            <span className="files__dot" />
            {place}
          </div>
        ))}
      </div>
      <div className="files__content">
        <div className="files__grid">
          {FOLDERS.map((folder) => (
            <div className="files__folder" key={folder}>
              <div className="files__folder-mark" />
              <span>{folder}</span>
            </div>
          ))}
        </div>
        <div className="files__list">
          {DOCUMENTS.map((doc) => (
            <div className="files__row" key={doc.name}>
              <span className="files__file-mark" />
              <span className="files__name">{doc.name}</span>
              <span className="files__meta">{doc.meta}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
