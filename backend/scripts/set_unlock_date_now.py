from datetime import datetime, timezone
from app.database import SessionLocal
from app.models.lock import SiteConfig

def main():
    db = SessionLocal()
    try:
        cfg = db.query(SiteConfig).first()
        if not cfg:
            cfg = SiteConfig(unlock_date=datetime.now(timezone.utc))
            db.add(cfg)
        else:
            print(f"Old unlock date was: {cfg.unlock_date}")
            cfg.unlock_date = datetime.now(timezone.utc)
        
        db.commit()
        print(f"New unlock date set to: {cfg.unlock_date}")
    finally:
        db.close()

if __name__ == "__main__":
    main()
