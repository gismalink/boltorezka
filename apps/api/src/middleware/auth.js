export async function requireAuth(request, reply) {
  try {
    await request.jwtVerify();
  } catch {
    reply.code(401).send({
      error: "Unauthorized",
      message: "Valid bearer token is required"
    });
  }
}
