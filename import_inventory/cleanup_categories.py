from sqlalchemy import create_engine, text

DATABASE_URL = 'sqlite:////volume1/web/wattsun/inventory.db'
engine = create_engine(DATABASE_URL)

with engine.begin() as conn:
    print("🔍 Finding orphaned categories...")
    orphaned = conn.execute(text("""
        SELECT c.id, c.name
        FROM categories c
        LEFT JOIN items i ON c.id = i.category_id
        WHERE i.sku IS NULL
    """)).fetchall()

    for row in orphaned:
        print(f"🗑️ Removing unused category: {row.name}")
        conn.execute(text("DELETE FROM categories WHERE id = :id"), {'id': row.id})

print("✅ Cleanup complete.")
