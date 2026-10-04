import { eq, and } from 'drizzle-orm';
import { db } from '../db/connection.js';
import { teams, teamMembers } from '../db/schema/index.js';
import type { Database } from '../db/connection.js';

export class TeamRepository {
  constructor(private readonly database: Database = db) {}

  async findAllByOrganization(organizationId: string) {
    return this.database.query.teams.findMany({
      where: eq(teams.organizationId, organizationId),
    });
  }

  async findById(organizationId: string, teamId: string) {
    return this.database.query.teams.findFirst({
      where: and(
        eq(teams.id, teamId),
        eq(teams.organizationId, organizationId),
      ),
    });
  }

  async create(organizationId: string, data: { name: string; description?: string }) {
    const [team] = await this.database
      .insert(teams)
      .values({
        organizationId,
        name: data.name,
        description: data.description,
      })
      .returning();
    return team!;
  }

  async update(
    organizationId: string,
    teamId: string,
    data: { name?: string; description?: string },
  ) {
    const [updated] = await this.database
      .update(teams)
      .set({ ...data, updatedAt: new Date() })
      .where(
        and(eq(teams.id, teamId), eq(teams.organizationId, organizationId)),
      )
      .returning();
    return updated;
  }

  async delete(organizationId: string, teamId: string) {
    await this.database
      .delete(teams)
      .where(
        and(eq(teams.id, teamId), eq(teams.organizationId, organizationId)),
      );
  }

  async addMember(teamId: string, memberId: string) {
    const [member] = await this.database
      .insert(teamMembers)
      .values({ teamId, memberId })
      .returning();
    return member!;
  }

  async removeMember(teamId: string, memberId: string) {
    await this.database
      .delete(teamMembers)
      .where(
        and(
          eq(teamMembers.teamId, teamId),
          eq(teamMembers.memberId, memberId),
        ),
      );
  }

  async getMembers(teamId: string) {
    return this.database.query.teamMembers.findMany({
      where: eq(teamMembers.teamId, teamId),
    });
  }
}
