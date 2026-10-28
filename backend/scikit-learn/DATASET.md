# Jeu de données de démarrage

Toutes les lignes de `dataset.csv` correspondent à des **logs fictifs**, explicitement marqués comme tels. Ce jeu sert uniquement à apprendre à charger des fichiers et des étiquettes, pas à revendiquer une performance réelle du classificateur.

- `log_path` : chemin du log, relatif à ce dossier.
- `label` : catégorie connue de l'échec fictif.
- `incident_group` : identifiant de l'incident. Les exemples 001 et 002 représentent une relance du même problème : ils doivent rester ensemble lors d'une séparation entraînement/test.

Le fichier existant `logs/pipeline1.txt` est conservé sans modification et n'est pas étiqueté automatiquement. Le script `main.py` actuel lit tous les `.txt` du dossier ; il ne charge pas encore ce CSV. Pour entraîner un modèle supervisé, il faudra lire les lignes du CSV et conserver l'alignement entre documents et étiquettes.

Avec seulement six exemples et une seule observation indépendante pour plusieurs catégories, ce jeu n'est pas suffisant pour une évaluation supervisée représentative. Ajoute des incidents variés, dont tu connais la cause, avant de comparer les modèles. Masque et inspecte les logs réels ; ne commite pas de données privées.
