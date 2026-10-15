# Cópias de segurança do PostgreSQL

A aplicação utiliza a base de dados PostgreSQL configurada em `DATABASE_URL`. Um administrador da plataforma pode descarregar uma cópia manual em formato custom através de **Configurações → Segurança e Backup de Dados**. A API executa `pg_dump` no servidor e envia o ficheiro `.dump` ao navegador. O processo não utiliza Supabase Storage.

O `pg_dump` tem de estar instalado no servidor da aplicação e disponível em `PATH`. Se estiver instalado noutro local, defina `PG_DUMP_PATH` com o caminho absoluto. A versão principal do executável deve ser igual ou superior à do servidor PostgreSQL.

A aplicação não agenda backups automáticos. O interruptor diário anterior apenas guardava uma preferência, sem criar um agendamento; por isso, a página de configurações agora informa essa limitação. Para automatizar cópias, configure uma tarefa agendada no alojamento e guarde os ficheiros fora do servidor da aplicação.

Os ficheiros incluem a base de dados completa, incluindo dados pessoais e hashes de credenciais. Restrinja o acesso ao download, guarde os ficheiros em segurança e teste a restauração numa base de dados separada antes de depender deles para recuperação.
