import radar_forecast


def test_partial_download_is_not_reported_installed(tmp_path, monkeypatch):
    monkeypatch.setattr(radar_forecast, 'MODEL_DIR', tmp_path)
    folder=tmp_path/'chronos-2'; folder.mkdir()
    (folder/'config.json').write_text('{}')
    (folder/'model.safetensors.part').write_bytes(b'partial')
    assert radar_forecast.status()['installed'] is False
    (folder/'model.safetensors.part').rename(folder/'model.safetensors')
    assert radar_forecast.status()['installed'] is True
