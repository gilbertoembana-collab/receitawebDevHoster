# Cópias de segurança do PostgreSQL

A aplicação utiliza a base de dados PostgreSQL configurada em `DATABASE_URL`. Um administrador da plataforma pode descarregar uma cópia manual em formato custom através de **Configurações → Segurança e Backup de Dados**. A API executa `pg_dump` no servidor e envia o ficheiro `.dump` ao navegador. O processo não utiliza Supabase Storage.

O `pg_dump` tem de estar instalado no servidor da aplicação e disponível em `PATH`. Se estiver instalado noutro local, defina `PG_DUMP_PATH` com o caminho absoluto. A versão principal do executável deve ser igual ou superior à do servidor PostgreSQL.

A restauração está disponível em **Configurações → Segurança e Backup de Dados** para administradores da plataforma. É possível carregar um dump SQL simples (`.sql`) ou o arquivo custom (`.dump`) descarregado pela aplicação. A operação substitui os objetos existentes no schema `public`, exige escrever `RESTAURAR` para confirmar e cria primeiro um backup custom de segurança. O ficheiro de segurança fica no servidor em `RECEITA360_BACKUP_DIR` (por padrão, `receita360-backups` dentro do diretório temporário do sistema) e pode ser descarregado após a operação. Guarde-o num local seguro; os ficheiros de segurança não são eliminados automaticamente.

Antes de criar o backup de segurança ou alterar dados, a aplicação confirma a ligação ao destino PostgreSQL, o nome da base de dados e as permissões do utilizador. Arquivos custom são verificados com `pg_restore --list`; os ficheiros SQL são verificados quanto a comandos psql não permitidos e controlos de transação. A janela de restauro mostra a fase atual e identifica a etapa e o erro quando a operação falha.

O servidor precisa de `psql` para restaurar ficheiros `.sql` e de `pg_restore` para ficheiros `.dump`. Se não estiverem em `PATH`, configure `PSQL_PATH` ou `PG_RESTORE_PATH`. O dump SQL é executado numa única transação: uma falha reverte as alterações. Os comandos psql que executam comandos externos ou mudam de conexão são rejeitados. Teste sempre o ficheiro numa base de dados separada antes de restaurar dados de produção.

A aplicação não agenda backups automáticos. O interruptor diário anterior apenas guardava uma preferência, sem criar um agendamento; por isso, a página de configurações agora informa essa limitação. Para automatizar cópias, configure uma tarefa agendada no alojamento e guarde os ficheiros fora do servidor da aplicação.

Os ficheiros incluem a base de dados completa, incluindo dados pessoais e hashes de credenciais. Restrinja o acesso ao download, guarde os ficheiros em segurança e teste a restauração numa base de dados separada antes de depender deles para recuperação.
