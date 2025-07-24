
import argparse
import pandas as pd
import os
import shutil
from sqlalchemy import create_engine, text

def upsert_category(conn, name, image_path):
    conn.execute(text("""
        INSERT OR REPLACE INTO categories (name, image)
        VALUES (:name, :image)
    """), {"name": name, "image": image_path})

def upsert_item(conn, sku, name, description, price, warranty, category):
    result = conn.execute(text("""
        SELECT id FROM categories WHERE name = :category
    """), {"category": category})
    category_row = result.fetchone()
    if not category_row:
        raise ValueError(f"Category '{category}' not found for SKU '{sku}'")
    category_id = category_row[0]

    conn.execute(text("""
        INSERT OR REPLACE INTO items (sku, name, description, price, warranty, category_id)
        VALUES (:sku, :name, :description, :price, :warranty, :category_id)
    """), {
        "sku": sku,
        "name": name,
        "description": description,
        "price": price,
        "warranty": warranty,
        "category_id": category_id,
    })

def main(args):
    print(f"Reading Excel file '{args.excel_path}'...")
    xls = pd.read_excel(args.excel_path, sheet_name=None, engine='openpyxl')
    category_df = xls["Category"]
    products_df = xls["Products"]

    # Connect to database
    engine = create_engine(args.database_url)
    with engine.begin() as conn:
        # Process categories
        for _, row in category_df.iterrows():
            name = row["CategoryName"]
            image_file = row["ImageFile"]
            src_path = os.path.join(args.images_dir, image_file)
            dst_rel_path = os.path.join("images/categories", image_file)
            dst_abs_path = os.path.join(args.assets_dir, dst_rel_path)

            if not os.path.isfile(src_path):
                print(f"Image '{src_path}' not found, using fallback 'missing.png'")
                src_path = os.path.join(args.images_dir, "missing.png")
                dst_rel_path = os.path.join("images/categories", "missing.png")
                dst_abs_path = os.path.join(args.assets_dir, dst_rel_path)

            os.makedirs(os.path.dirname(dst_abs_path), exist_ok=True)
            shutil.copyfile(src_path, dst_abs_path)

            print(f"Adding new category '{name}' with image '{dst_rel_path}'")
            upsert_category(conn, name, dst_rel_path)

        # Process products
        for _, row in products_df.iterrows():
            try:
                upsert_item(
                    conn=conn,
                    sku=row["MODEL"],
                    name=row["MODEL"],
                    description=row["DESCRIPTION"],
                    price=row["PRICE(KSH)"],
                    warranty=row["WARRANTY"],
                    category=row["CATEGORY"],
                )
                print(f"Added item '{row['MODEL']}'")
            except Exception as e:
                print(f"Skipping item '{row['MODEL']}' due to error: {e}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--excel-path", required=True)
    parser.add_argument("--images-dir", required=True)
    parser.add_argument("--assets-dir", required=True)
    parser.add_argument("--database-url", required=True)
    args = parser.parse_args()
    main(args)
