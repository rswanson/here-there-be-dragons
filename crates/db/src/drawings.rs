use chrono::{DateTime, Utc};
use sqlx::PgPool;
use uuid::Uuid;

pub struct DrawingRow {
    pub id: Uuid,
    pub layer_id: Uuid,
    pub drawing_type: String,
    pub points_json: serde_json::Value,
    pub stroke_color: String,
    pub stroke_width: f32,
    pub stroke_opacity: f32,
    pub fill_color: Option<String>,
    pub fill_opacity: f32,
    pub created_at: DateTime<Utc>,
}

impl From<DrawingRow> for htbd_core::drawing::Drawing {
    fn from(row: DrawingRow) -> Self {
        Self {
            id: row.id,
            layer_id: row.layer_id,
            drawing_type: serde_json::from_value(serde_json::Value::String(row.drawing_type))
                .unwrap_or(htbd_core::drawing::DrawingType::Freehand),
            points: row.points_json,
            stroke_color: row.stroke_color,
            stroke_width: row.stroke_width,
            stroke_opacity: row.stroke_opacity,
            fill_color: row.fill_color,
            fill_opacity: row.fill_opacity,
            created_at: row.created_at,
        }
    }
}

#[allow(clippy::too_many_arguments)]
pub async fn create_drawing(
    pool: &PgPool,
    layer_id: &Uuid,
    drawing_type: &str,
    points_json: &serde_json::Value,
    stroke_color: &str,
    stroke_width: f32,
    stroke_opacity: f32,
    fill_color: Option<&str>,
    fill_opacity: f32,
) -> Result<DrawingRow, sqlx::Error> {
    sqlx::query_as!(
        DrawingRow,
        r#"INSERT INTO drawings (layer_id, drawing_type, points_json, stroke_color, stroke_width, stroke_opacity, fill_color, fill_opacity)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           RETURNING *"#,
        layer_id,
        drawing_type,
        points_json,
        stroke_color,
        stroke_width,
        stroke_opacity,
        fill_color,
        fill_opacity
    )
    .fetch_one(pool)
    .await
}

pub async fn find_by_id(pool: &PgPool, id: &Uuid) -> Result<Option<DrawingRow>, sqlx::Error> {
    sqlx::query_as!(DrawingRow, "SELECT * FROM drawings WHERE id = $1", id)
        .fetch_optional(pool)
        .await
}

pub async fn list_for_layer(
    pool: &PgPool,
    layer_id: &Uuid,
) -> Result<Vec<DrawingRow>, sqlx::Error> {
    sqlx::query_as!(
        DrawingRow,
        "SELECT * FROM drawings WHERE layer_id = $1 ORDER BY created_at ASC",
        layer_id
    )
    .fetch_all(pool)
    .await
}

#[allow(clippy::too_many_arguments)]
pub async fn update_drawing(
    pool: &PgPool,
    id: &Uuid,
    points_json: Option<&serde_json::Value>,
    stroke_color: Option<&str>,
    stroke_width: Option<f32>,
    stroke_opacity: Option<f32>,
    fill_color: Option<Option<&str>>,
    fill_opacity: Option<f32>,
) -> Result<Option<DrawingRow>, sqlx::Error> {
    sqlx::query_as!(
        DrawingRow,
        r#"UPDATE drawings SET
            points_json = COALESCE($2, points_json),
            stroke_color = COALESCE($3, stroke_color),
            stroke_width = COALESCE($4, stroke_width),
            stroke_opacity = COALESCE($5, stroke_opacity),
            fill_color = CASE WHEN $6 THEN $7 ELSE fill_color END,
            fill_opacity = COALESCE($8, fill_opacity)
        WHERE id = $1
        RETURNING *"#,
        id,
        points_json,
        stroke_color,
        stroke_width,
        stroke_opacity,
        fill_color.is_some(),
        fill_color.flatten(),
        fill_opacity
    )
    .fetch_optional(pool)
    .await
}

pub async fn delete_drawing(pool: &PgPool, id: &Uuid) -> Result<bool, sqlx::Error> {
    let result = sqlx::query!("DELETE FROM drawings WHERE id = $1", id)
        .execute(pool)
        .await?;
    Ok(result.rows_affected() > 0)
}

pub async fn get_layer_id_for_drawing(
    pool: &PgPool,
    drawing_id: &Uuid,
) -> Result<Option<Uuid>, sqlx::Error> {
    sqlx::query_scalar!("SELECT layer_id FROM drawings WHERE id = $1", drawing_id)
        .fetch_optional(pool)
        .await
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::PgPool;

    async fn setup_drawing_layer(pool: &PgPool) -> Uuid {
        let user = crate::users::create_user(pool, "dm@test.com", "hash", "DM")
            .await
            .unwrap();
        let campaign = crate::campaigns::create_campaign(pool, "Campaign", user.id, "DRAW0001")
            .await
            .unwrap();
        let map = crate::maps::create_map(pool, &campaign.id, "Map")
            .await
            .unwrap();
        let layer = crate::map_layers::create_layer(pool, &map.id, "Drawings", "drawing", false)
            .await
            .unwrap();
        layer.id
    }

    #[sqlx::test(migrations = "../../migrations")]
    async fn test_create_and_find_drawing(pool: PgPool) {
        let layer_id = setup_drawing_layer(&pool).await;
        let points = serde_json::json!([{"x": 0, "y": 0}, {"x": 10, "y": 10}]);

        let drawing = create_drawing(
            &pool, &layer_id, "line", &points, "#ff0000", 3.0, 1.0, None, 0.3,
        )
        .await
        .unwrap();
        assert_eq!(drawing.drawing_type, "line");
        assert_eq!(drawing.stroke_color, "#ff0000");

        let found = find_by_id(&pool, &drawing.id).await.unwrap().unwrap();
        assert_eq!(found.id, drawing.id);
    }

    #[sqlx::test(migrations = "../../migrations")]
    async fn test_list_and_delete_drawings(pool: PgPool) {
        let layer_id = setup_drawing_layer(&pool).await;
        let points = serde_json::json!([]);

        create_drawing(
            &pool, &layer_id, "freehand", &points, "#fff", 2.0, 1.0, None, 0.3,
        )
        .await
        .unwrap();
        create_drawing(
            &pool,
            &layer_id,
            "rectangle",
            &points,
            "#fff",
            2.0,
            1.0,
            Some("#00f"),
            0.5,
        )
        .await
        .unwrap();

        let drawings = list_for_layer(&pool, &layer_id).await.unwrap();
        assert_eq!(drawings.len(), 2);

        delete_drawing(&pool, &drawings[0].id).await.unwrap();
        let remaining = list_for_layer(&pool, &layer_id).await.unwrap();
        assert_eq!(remaining.len(), 1);
    }
}
