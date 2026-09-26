export async function onRequestGet(context) {
  try {
    if (!context.env.DB) {
      return Response.json(
        {
          ok: false,
          service: "GAMMS AEP",
          database: "binding_missing"
        },
        { status: 500 }
      );
    }

    const result = await context.env.DB
      .prepare("SELECT 1 AS ok")
      .first();

    return Response.json({
      ok: result?.ok === 1,
      service: "GAMMS AEP",
      database: "connected",
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        service: "GAMMS AEP",
        database: "error"
      },
      { status: 500 }
    );
  }
}
