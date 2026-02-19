import NextAuth from 'next-auth';
import AzureADProvider from 'next-auth/providers/azure-ad';

const handler = NextAuth({
  providers: [
    AzureADProvider({
      clientId: process.env.AZURE_AD_CLIENT_ID!,
      clientSecret: process.env.AZURE_AD_CLIENT_SECRET!,
      tenantId: process.env.AZURE_AD_TENANT_ID!,
    }),
  ],
  callbacks: {
    async session({ session, token }) {
      // Ensure email is always available in the session
      if (token?.email && session.user) {
        session.user.email = token.email;
      }
      return session;
    },
  },
});

export { handler as GET, handler as POST };
