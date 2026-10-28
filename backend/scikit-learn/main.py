from pathlib import Path

from sklearn.feature_extraction.text import TfidfVectorizer

logs_dir = Path(__file__).parent / "logs"

documents = [
    path.read_text(encoding="utf-8")
    for path in sorted(logs_dir.glob("*.txt"))
    if path.read_text(encoding="utf-8").strip()
]


vectorizer = TfidfVectorizer(
    ngram_range=(1, 2),
    max_features=10_000,
)

X = vectorizer.fit_transform(documents)
print(X.shape)
