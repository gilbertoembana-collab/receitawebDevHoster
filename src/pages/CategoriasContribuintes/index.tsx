import React, { useState } from 'react';
import { useAppStore } from '../../store';
import { apiFetch } from '../../services/api';
import { dbService } from '../../services/db';
import { CategoriaContribuinte } from '../../types';
import { Edit2, Plus, Tags } from 'lucide-react';
import {
  Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle,
  Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  TextField, Typography,
} from '@mui/material';

const MANAGER_ROLES = ['Platform Owner', 'Super Administrador', 'Super Admin', 'Administrator'];

export default function CategoriasContribuintes() {
  const { categoriasContribuintes, activeProfile, addNotification } = useAppStore();
  const [editing, setEditing] = useState<CategoriaContribuinte | null>(null);
  const [open, setOpen] = useState(false);
  const [nome, setNome] = useState('');
  const [descricao, setDescricao] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const canManage = MANAGER_ROLES.includes(activeProfile);

  const openNew = () => {
    setEditing(null);
    setNome('');
    setDescricao('');
    setOpen(true);
  };

  const openEdit = (category: CategoriaContribuinte) => {
    setEditing(category);
    setNome(category.nome);
    setDescricao(category.descricao);
    setOpen(true);
  };

  const saveCategory = async () => {
    const normalizedName = nome.trim();
    if (!normalizedName) {
      addNotification({ title: 'Campo obrigatório', message: 'Informe o nome da categoria.', type: 'warning' });
      return;
    }

    setIsSaving(true);
    try {
      const endpoint = editing
        ? `/api/categoria_contribuintes/${encodeURIComponent(editing.id)}`
        : '/api/categoria_contribuintes';
      const response = await apiFetch(endpoint, {
        method: editing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editing?.id ?? `cat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          nome: normalizedName,
          descricao: descricao.trim(),
          status: editing?.status ?? 'ativo',
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result.error || 'Não foi possível guardar a categoria.');
      }

      await dbService.forceSync();
      setOpen(false);
      addNotification({
        title: editing ? 'Categoria atualizada' : 'Categoria criada',
        message: `A categoria "${normalizedName}" foi guardada.`,
        type: 'success',
      });
    } catch (error) {
      addNotification({
        title: 'Erro ao guardar categoria',
        message: error instanceof Error ? error.message : 'Não foi possível comunicar com o servidor.',
        type: 'warning',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const toggleStatus = async (category: CategoriaContribuinte) => {
    const nextStatus = category.status === 'ativo' ? 'inativo' : 'ativo';
    try {
      const response = await apiFetch(`/api/categoria_contribuintes/${encodeURIComponent(category.id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...category, status: nextStatus }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Não foi possível alterar o estado.');
      await dbService.forceSync();
      addNotification({
        title: nextStatus === 'ativo' ? 'Categoria ativada' : 'Categoria desativada',
        message: `A categoria "${category.nome}" foi ${nextStatus === 'ativo' ? 'ativada' : 'desativada'}.`,
        type: 'success',
      });
    } catch (error) {
      addNotification({
        title: 'Erro ao alterar categoria',
        message: error instanceof Error ? error.message : 'Não foi possível comunicar com o servidor.',
        type: 'warning',
      });
    }
  };

  return (
    <Box sx={{ py: 1 }} className="animate-fade-in">
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <div>
          <Typography variant="h1">Gerir Categorias de Contribuintes</Typography>
          <Typography variant="body1" sx={{ color: 'text.secondary' }}>
            Configure as categorias utilizadas no cadastro de contribuintes.
          </Typography>
        </div>
        {canManage && (
          <Button variant="contained" startIcon={<Plus size={18} />} onClick={openNew}>
            Nova Categoria
          </Button>
        )}
      </Box>

      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Categoria</TableCell>
              <TableCell>Descrição</TableCell>
              <TableCell>Estado</TableCell>
              {canManage && <TableCell align="right">Ações</TableCell>}
            </TableRow>
          </TableHead>
          <TableBody>
            {categoriasContribuintes.map(category => (
              <TableRow key={category.id} hover>
                <TableCell>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Tags size={15} className="text-blue-600" />
                    <span className="font-semibold">{category.nome}</span>
                  </Box>
                </TableCell>
                <TableCell>{category.descricao || '—'}</TableCell>
                <TableCell>
                  <Chip
                    size="small"
                    label={category.status === 'ativo' ? 'Ativa' : 'Inativa'}
                    color={category.status === 'ativo' ? 'success' : 'default'}
                  />
                </TableCell>
                {canManage && (
                  <TableCell align="right">
                    <Button size="small" startIcon={<Edit2 size={14} />} onClick={() => openEdit(category)}>
                      Editar
                    </Button>
                    <Button
                      size="small"
                      color={category.status === 'ativo' ? 'error' : 'success'}
                      onClick={() => void toggleStatus(category)}
                    >
                      {category.status === 'ativo' ? 'Desativar' : 'Ativar'}
                    </Button>
                  </TableCell>
                )}
              </TableRow>
            ))}
            {categoriasContribuintes.length === 0 && (
              <TableRow>
                <TableCell colSpan={canManage ? 4 : 3} align="center">
                  Nenhuma categoria carregada.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={open} onClose={() => !isSaving && setOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editing ? 'Editar Categoria' : 'Nova Categoria de Contribuinte'}</DialogTitle>
        <DialogContent dividers>
          <Box sx={{ display: 'grid', gap: 2, pt: 1 }}>
            <TextField
              required
              autoFocus
              label="Nome da Categoria"
              value={nome}
              onChange={event => setNome(event.target.value)}
              slotProps={{ htmlInput: { maxLength: 100 } }}
            />
            <TextField
              label="Descrição"
              multiline
              minRows={2}
              value={descricao}
              onChange={event => setDescricao(event.target.value)}
              slotProps={{ htmlInput: { maxLength: 300 } }}
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)} disabled={isSaving} color="inherit">Cancelar</Button>
          <Button onClick={() => void saveCategory()} disabled={isSaving || !canManage} variant="contained">
            {isSaving ? 'A guardar…' : 'Guardar'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
